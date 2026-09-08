package handlers

import (
	"net/http"
	"os"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
	"fitmentor/api/internal/services"
)

func CoachLog(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var req struct {
			UserMessage  string  `json:"user_message"`
			Reply        string  `json:"reply"`
			ContainerTag string  `json:"container_tag"`
			Messages     any     `json:"messages"`
			SessionID    *string `json:"session_id"`
		}
		if err := decodeJSON(r, &req); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		var tier string
		_ = st.Pool.QueryRow(ctx,
			`SELECT s.tier FROM subscriptions s
			 JOIN users u ON s.user_id = u.id
			 WHERE u.cf_access_sub = $1 AND s.status = 'active' LIMIT 1`,
			auth.UserID).Scan(&tier)
		if tier == "" {
			tier = "free"
		}
		_, _ = st.Pool.Exec(ctx,
			`INSERT INTO coach_logs (user_id, container_tag) VALUES ($1, $2)
			 ON CONFLICT (user_id, container_tag) DO NOTHING`,
			auth.UserID, req.ContainerTag)

		if req.SessionID != nil && *req.SessionID != "" {
			msgs := toAnySlice(req.Messages)
			msgs = append(msgs, map[string]string{"role": "assistant", "content": req.Reply})
			encoded, _ := jsonMarshalAny(msgs)
			_, _ = st.Pool.Exec(ctx,
				`UPDATE chat_sessions SET messages = $1, updated_at = NOW()
				 WHERE id = CAST($2 AS uuid) AND user_id = $3`,
				string(encoded), *req.SessionID, auth.UserID)
		}

		services.PublishCoachLog(st.Cache.Client(), map[string]any{
			"user_id": auth.UserID, "container_tag": req.ContainerTag, "tier": tier,
			"user_message": req.UserMessage, "reply": req.Reply,
			"messages": req.Messages, "session_id": req.SessionID,
		})

		ingestURL := os.Getenv("INGEST_URL")
		if ingestURL == "" {
			ingestURL = "http://ws:8080"
		}
		services.ForwardIngest(ingestURL, req.ContainerTag,
			"User: "+req.UserMessage+"\nCoach: "+req.Reply, tier)

		writeJSON(w, map[string]any{"ok": true})
	}
}
