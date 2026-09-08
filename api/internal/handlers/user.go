package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
	"fitmentor/api/internal/models"
	"fitmentor/api/internal/services"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// SyncUser mirrors routes/user.rs sync_user (x-api-key checked manually,
// NOT via middleware — the route is public).
func SyncUser(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") == "" || r.Header.Get("x-api-key") != st.APISharedSecret {
			apperr.Write(w, apperr.UnauthorizedErr())
			return
		}
		var req struct {
			CFSub string  `json:"cf_sub"`
			Email string  `json:"email"`
			Name  *string `json:"name"`
		}
		if err := decodeJSON(r, &req); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		u, err := upsertUserFull(ctx, st, req.CFSub, req.Email, req.Name)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		sessionID := uuid.NewString()
		sessionPayload := map[string]any{
			"sub": req.CFSub, "cf_sub": req.CFSub, "email": req.Email,
			"name": req.Name, "iat": time.Now().UnixMilli(),
		}
		payloadBytes, _ := json.Marshal(sessionPayload)
		st.Cache.Set("session:"+sessionID, string(payloadBytes), 604800)
		writeJSON(w, map[string]any{
			"ok": true, "session_id": sessionID,
			"user": map[string]any{"id": u.ID, "cf_sub": u.CFSub, "email": u.Email},
		})
	}
}

func upsertUserFull(ctx context.Context, st *app.State, cfSub, email string, name *string) (models.User, error) {
	var u models.User
	var nameVal any
	if name != nil {
		nameVal = *name
	}
	err := st.Pool.QueryRow(ctx,
		`INSERT INTO users (cf_access_sub, email, name) VALUES ($1, $2, $3)
		 ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email,
		 name = COALESCE(EXCLUDED.name, users.name), updated_at = now()
		 RETURNING id, cf_access_sub, email, name, created_at, updated_at`,
		cfSub, email, nameVal).Scan(
		&u.ID, &u.CFSub, &u.Email, &u.Name, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return u, apperr.InternalErr(err)
	}
	return u, nil
}

func GetMe(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		user, err := upsertUser(ctx, st, auth.UserID, auth.Email)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		cacheKey := "cache:user:" + user.ID
		if cached, ok := st.Cache.Get(cacheKey); ok {
			var body any
			if json.Unmarshal([]byte(cached), &body) == nil {
				writeJSON(w, body)
				return
			}
		}
		_, _ = st.Pool.Exec(ctx,
			`INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, user.ID)
		var profile *models.Profile
		row := st.Pool.QueryRow(ctx,
			`SELECT `+profileColumns+` FROM profiles WHERE user_id = $1`, user.ID)
		if p, err := scanProfileRow(row); err == nil {
			profile = &p
		} else if err != pgx.ErrNoRows {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		var profileVal any
		if profile != nil {
			profileVal = profileToMap(*profile)
		}
		resp := map[string]any{"data": map[string]any{
			"user":    userToMap(user),
			"profile": profileVal,
		}}
		if raw, err := json.Marshal(resp); err == nil {
			st.Cache.Set(cacheKey, string(raw), 300)
		}
		st.Cache.Delete("cache:user:" + auth.UserID)
		writeJSON(w, resp)
	}
}

func CheckUserExists(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		_, err = getUserByCFSub(r.Context(), st, auth.UserID)
		writeJSON(w, map[string]any{"exists": err == nil})
	}
}

func UpdateProfile(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var input models.UpdateProfile
		if err := decodeJSON(r, &input); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		user, err := getUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		if input.Name != nil {
			if _, err := st.Pool.Exec(ctx,
				`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, user.ID, *input.Name); err != nil {
				apperr.Write(w, apperr.InternalErr(err))
				return
			}
		}
		_, _ = st.Pool.Exec(ctx,
			`INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, user.ID)
		profile, err := scanProfileRow(st.Pool.QueryRow(ctx,
			`UPDATE profiles SET
				name = COALESCE($2, name), age = COALESCE($3, age),
				gender = COALESCE($4, gender), height_cm = COALESCE($5, height_cm),
				weight_kg = COALESCE($6, weight_kg), goal = COALESCE($7, goal),
				place = COALESCE($8, place), experience = COALESCE($9, experience),
				diet = COALESCE($10, diet), days_per_week = COALESCE($11, days_per_week),
				budget_per_day = COALESCE($12, budget_per_day),
				health_conditions = COALESCE($13, health_conditions), updated_at = now()
			 WHERE user_id = $1
			 RETURNING `+profileColumns,
			user.ID, nilIfEmptyString(input.Name), nilIfNilInt16(input.Age),
			nilIfEmptyString(input.Gender), nilIfNilInt16(input.HeightCm),
			nilIfNilInt16(input.WeightKg), nilIfEmptyString(input.Goal),
			nilIfEmptyString(input.Place), nilIfEmptyString(input.Experience),
			nilIfEmptyString(input.Diet), nilIfNilInt16(input.DaysPerWeek),
			nilIfNilInt16(input.BudgetPerDay), nilIfNilStrSlice(input.HealthConditions)))
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		st.Cache.InvalidateUser(user.ID)
		st.Cache.Delete("cache:user:" + auth.UserID)
		services.TriggerGenerate(st.PlannerURL, auth.UserID)
		writeJSON(w, map[string]any{"data": map[string]any{
			"user":    userToMap(user),
			"profile": profileToMap(profile),
		}})
	}
}

func UpdateProteinTarget(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var input models.ProteinTarget
		if err := decodeJSON(r, &input); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		user, err := getUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		if _, err := st.Pool.Exec(ctx,
			`UPDATE profiles SET custom_protein_g = $2, updated_at = now() WHERE user_id = $1`,
			user.ID, nilIfNilInt16(input.ProteinG)); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		st.Cache.InvalidateUser(user.ID)
		st.Cache.Delete("cache:user:" + auth.UserID)
		writeJSON(w, map[string]any{"data": map[string]any{"user": userToMap(user)}})
	}
}

func nilIfNilStrSlice(v *[]string) any {
	if v == nil {
		return nil
	}
	return *v
}
