package handlers

import (
	"encoding/json"
	"net/http"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"

	"github.com/jackc/pgx/v5"
)

func GetPlan(table string, st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var plan json.RawMessage
		err = st.Pool.QueryRow(r.Context(),
			`SELECT plan FROM `+table+` WHERE user_id = $1 AND date = $2`,
			auth.UserID, todayDate()).Scan(&plan)
		if err != nil {
			if err == pgx.ErrNoRows {
				apperr.Write(w, apperr.NotFoundErr())
				return
			}
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"data": map[string]any{"plan": plan}})
	}
}

func UpsertPlan(table string, st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var input struct {
			Plan json.RawMessage `json:"plan"`
		}
		if err := decodeJSON(r, &input); err != nil {
			apperr.Write(w, err)
			return
		}
		if _, err := st.Pool.Exec(r.Context(),
			`INSERT INTO `+table+` (user_id, date, plan) VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, date) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
			auth.UserID, todayDate(), string(input.Plan)); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"data": map[string]any{"plan": input.Plan}})
	}
}
