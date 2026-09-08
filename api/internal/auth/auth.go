// Package auth mirrors auth/middleware.rs (REST extractor) and the
// extract_auth_user session bridge in main.rs (GraphQL path).
package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"fitmentor/api/internal/app"
)

type AuthUser struct {
	UserID string
	Email  string
}

type ctxKey struct{}

// Middleware enforces the REST auth rules: API-key, then JWT.
// (No session-cookie path here — matches FromRequestParts.)
func Middleware(st *app.State, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := checkAPIKey(st, r.Header)
		if !ok {
			token, ok := bearerToken(r.Header)
			if !ok {
				unauthorized(w)
				return
			}
			claims, err := st.JWT.Validate(token)
			if err != nil {
				unauthorized(w)
				return
			}
			user = AuthUser{UserID: claims.Sub, Email: claims.Email}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, user)))
	})
}

func FromContext(ctx context.Context) (AuthUser, bool) {
	u, ok := ctx.Value(ctxKey{}).(AuthUser)
	return u, ok
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":{"code":"unauthorized","message":"unauthorized"}}`))
}

func checkAPIKey(st *app.State, h http.Header) (AuthUser, bool) {
	if st.APISharedSecret == "" {
		return AuthUser{}, false
	}
	if h.Get("x-api-key") != st.APISharedSecret {
		return AuthUser{}, false
	}
	return AuthUser{UserID: h.Get("x-user-id"), Email: h.Get("x-user-email")}, true
}

func bearerToken(h http.Header) (string, bool) {
	t := h.Get("cf-access-jwt-assertion")
	if t == "" {
		t = h.Get("authorization")
	}
	if t == "" {
		return "", false
	}
	if rest, ok := strings.CutPrefix(t, "Bearer "); ok {
		t = rest
	}
	return t, true
}

// ExtractAuthUser mirrors main.rs extract_auth_user for the GraphQL endpoint:
// API-key (with user upsert) → JWT → session cookie (Redis, then Workers KV bridge).
func ExtractAuthUser(st *app.State, r *http.Request) *AuthUser {
	h := r.Header
	if st.APISharedSecret != "" && h.Get("x-api-key") == st.APISharedSecret {
		uid := h.Get("x-user-id")
		email := h.Get("x-user-email")
		if uid != "" {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			_, _ = st.Pool.Exec(ctx,
				`INSERT INTO users (cf_access_sub, email) VALUES ($1, $2)
				 ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = now()`,
				uid, email)
			cancel()
		}
		return &AuthUser{UserID: uid, Email: email}
	}
	if token, ok := bearerToken(h); ok {
		if claims, err := st.JWT.Validate(token); err == nil {
			return &AuthUser{UserID: claims.Sub, Email: claims.Email}
		}
	}
	if sid := sessionIDFromCookie(h.Get("cookie")); sid != "" {
		if u := sessionFromRedis(st, sid); u != nil {
			return u
		}
		if u := sessionFromBridge(st, sid); u != nil {
			return u
		}
	}
	return nil
}

func sessionIDFromCookie(cookie string) string {
	for _, part := range strings.Split(cookie, ";") {
		if sid, ok := strings.CutPrefix(strings.TrimSpace(part), "fitmentor_session="); ok {
			return sid
		}
	}
	return ""
}

func upsertSessionUser(st *app.State, ctx context.Context, userID, email, name string) {
	_, _ = st.Pool.Exec(ctx,
		`INSERT INTO users (cf_access_sub, email, name) VALUES ($1, $2, $3)
		 ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email,
		 name = COALESCE(EXCLUDED.name, users.name), updated_at = now()`,
		userID, email, name)
}

func sessionFromRedis(st *app.State, sid string) *AuthUser {
	raw, ok := st.Cache.Get("session:" + sid)
	if !ok {
		return nil
	}
	var data struct {
		Sub   string `json:"sub"`
		CFSub string `json:"cf_sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return nil
	}
	uid := data.Sub
	if uid == "" {
		uid = data.CFSub
	}
	if uid == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	upsertSessionUser(st, ctx, uid, data.Email, data.Name)
	return &AuthUser{UserID: uid, Email: data.Email}
}

func sessionFromBridge(st *app.State, sid string) *AuthUser {
	if st.AppURL == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, st.AppURL+"/api/validate-session", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("cookie", "fitmentor_session="+sid)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || !isSuccess(resp.StatusCode) {
		if resp != nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		return nil
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil
	}
	var data struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(body, &data); err != nil || data.Sub == "" {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"sub":    data.Sub,
		"cf_sub": data.Sub,
		"email":  data.Email,
		"name":   data.Name,
		"iat":    time.Now().UnixMilli(),
	})
	st.Cache.Set("session:"+sid, string(payload), 604800)
	upsertSessionUser(st, ctx, data.Sub, data.Email, data.Name)
	return &AuthUser{UserID: data.Sub, Email: data.Email}
}

func isSuccess(code int) bool { return code >= 200 && code < 300 }
