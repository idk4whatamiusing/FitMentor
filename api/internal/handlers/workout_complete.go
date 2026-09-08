package handlers

import (
	"net/http"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
)

func CompleteWorkout(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var req struct {
			DayIndex int16  `json:"day_index"`
			Title    string `json:"title"`
		}
		if err := decodeJSON(r, &req); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		var userID string
		if err := st.Pool.QueryRow(ctx,
			`SELECT id FROM users WHERE cf_access_sub = $1`, auth.UserID).Scan(&userID); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		if _, err := st.Pool.Exec(ctx,
			`INSERT INTO workout_completions (user_id, date, day_index, title)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (user_id, date, day_index) DO NOTHING`,
			userID, todayDate(), req.DayIndex, req.Title); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	}
}

func ListWorkoutCompletions(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		var userID string
		if err := st.Pool.QueryRow(ctx,
			`SELECT id FROM users WHERE cf_access_sub = $1`, auth.UserID).Scan(&userID); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		rows, err := st.Pool.Query(ctx,
			`SELECT day_index, title FROM workout_completions WHERE user_id = $1 AND date = $2`,
			userID, todayDate())
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		defer rows.Close()
		items := []any{}
		for rows.Next() {
			var dayIndex int16
			var title string
			if err := rows.Scan(&dayIndex, &title); err != nil {
				apperr.Write(w, apperr.InternalErr(err))
				return
			}
			items = append(items, map[string]any{"day_index": dayIndex, "title": title})
		}
		if err := rows.Err(); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"data": map[string]any{"completions": items}})
	}
}
