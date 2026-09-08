package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type sessionRow struct {
	ID        string          `json:"id"`
	UserID    string          `json:"user_id"`
	Title     string          `json:"title"`
	Messages  json.RawMessage `json:"messages"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func CreateCoachSession(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var req struct {
			Title *string `json:"title"`
		}
		if err := decodeJSON(r, &req); err != nil {
			apperr.Write(w, err)
			return
		}
		title := "New Chat"
		if req.Title != nil {
			title = *req.Title
		}
		var id string
		if err := st.Pool.QueryRow(r.Context(),
			`INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id`,
			auth.UserID, title).Scan(&id); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"id": id})
	}
}

func ListCoachSessions(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		rows, err := st.Pool.Query(r.Context(),
			`SELECT id, user_id, title, messages, created_at, updated_at
			 FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC`, auth.UserID)
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		defer rows.Close()
		items := []any{}
		for rows.Next() {
			var s sessionRow
			var msgs json.RawMessage
			if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &msgs, &s.CreatedAt, &s.UpdatedAt); err != nil {
				apperr.Write(w, apperr.InternalErr(err))
				return
			}
			var arr []any
			_ = json.Unmarshal(msgs, &arr)
			items = append(items, map[string]any{
				"id": s.ID, "title": s.Title,
				"message_count": int32(len(arr)), "created_at": s.CreatedAt,
			})
		}
		if err := rows.Err(); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, items)
	}
}

func GetCoachSession(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		id := chi.URLParam(r, "id")
		var s sessionRow
		var msgs json.RawMessage
		err = st.Pool.QueryRow(r.Context(),
			`SELECT id, user_id, title, messages, created_at, updated_at
			 FROM chat_sessions WHERE id = $1 AND user_id = $2`, id, auth.UserID).
			Scan(&s.ID, &s.UserID, &s.Title, &msgs, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			if err == pgx.ErrNoRows {
				apperr.Write(w, apperr.NotFoundErr())
				return
			}
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		s.Messages = msgs
		writeJSON(w, s)
	}
}

func DeleteCoachSession(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		id := chi.URLParam(r, "id")
		tag, err := st.Pool.Exec(r.Context(),
			`DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`, id, auth.UserID)
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		if tag.RowsAffected() == 0 {
			apperr.Write(w, apperr.NotFoundErr())
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	}
}
