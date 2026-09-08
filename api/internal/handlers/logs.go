package handlers

import (
	"net/http"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
	"fitmentor/api/internal/models"

	"github.com/jackc/pgx/v5"
)

func GetTodayLog(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		user, err := mustUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		cacheKey := "cache:today:" + user.ID
		if cached, ok := st.Cache.Get(cacheKey); ok {
			var body any
			if jsonUnmarshalCached(cached, &body) {
				writeJSON(w, body)
				return
			}
		}
		row := st.Pool.QueryRow(ctx,
			`SELECT `+dailyLogColumns+` FROM daily_logs WHERE user_id = $1 AND date = $2`,
			user.ID, todayDate())
		log, err := scanDailyLogRow(row)
		if err != nil && err != pgx.ErrNoRows {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		var logVal any
		if err == nil {
			logVal = dailyLogToMap(log)
		}
		resp := map[string]any{"data": map[string]any{"log": logVal}}
		cacheSetJSON(st, cacheKey, resp, 30)
		writeJSON(w, resp)
	}
}

func UpsertTodayLog(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var input models.UpdateDailyLog
		if err := decodeJSON(r, &input); err != nil {
			apperr.Write(w, err)
			return
		}
		ctx := r.Context()
		user, err := mustUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var water any = 0
		if input.Water != nil {
			water = *input.Water
		}
		var sleep any = 0.0
		if input.Sleep != nil {
			sleep = *input.Sleep
		}
		var steps any = 0
		if input.Steps != nil {
			steps = *input.Steps
		}
		var protein any = 0.0
		if input.ProteinG != nil {
			protein = *input.ProteinG
		}
		var done any = false
		if input.WorkoutDone != nil {
			done = *input.WorkoutDone
		}
		var weight any
		if input.WeightKg != nil {
			weight = *input.WeightKg
		}
		log, err := scanDailyLogRow(st.Pool.QueryRow(ctx,
			`INSERT INTO daily_logs (user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (user_id, date) DO UPDATE SET
				water = COALESCE($3, daily_logs.water),
				sleep = COALESCE($4, daily_logs.sleep),
				steps = COALESCE($5, daily_logs.steps),
				protein_g = COALESCE($6, daily_logs.protein_g),
				workout_done = COALESCE($7, daily_logs.workout_done),
				weight_kg = COALESCE($8, daily_logs.weight_kg),
				updated_at = now()
			 RETURNING `+dailyLogColumns,
			user.ID, todayDate(), water, sleep, steps, protein, done, weight))
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		st.Cache.InvalidateToday(user.ID)
		st.Cache.Delete("cache:today:" + auth.UserID)
		writeJSON(w, map[string]any{"data": map[string]any{"log": dailyLogToMap(log)}})
	}
}

func GetLogsRange(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		q := r.URL.Query()
		from, to := q.Get("from"), q.Get("to")
		if from == "" || to == "" {
			apperr.Write(w, apperr.BadRequestf("missing from/to"))
			return
		}
		ctx := r.Context()
		user, err := mustUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		rows, err := st.Pool.Query(ctx,
			`SELECT `+dailyLogColumns+` FROM daily_logs
			 WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC`,
			user.ID, from, to)
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		defer rows.Close()
		logs := []any{}
		for rows.Next() {
			l, err := scanDailyLogRow(rows)
			if err != nil {
				apperr.Write(w, apperr.InternalErr(err))
				return
			}
			logs = append(logs, dailyLogToMap(l))
		}
		if err := rows.Err(); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		writeJSON(w, map[string]any{"data": map[string]any{"logs": logs}})
	}
}

func GetStreak(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		cacheKey := "cache:streak:" + auth.UserID
		if cached, ok := st.Cache.Get(cacheKey); ok {
			var body any
			if jsonUnmarshalCached(cached, &body) {
				writeJSON(w, body)
				return
			}
		}
		ctx := r.Context()
		user, err := mustUserByCFSub(ctx, st, auth.UserID)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		rows, err := st.Pool.Query(ctx,
			`SELECT date FROM daily_logs WHERE user_id = $1 AND workout_done = true
			 ORDER BY date DESC LIMIT 100`, user.ID)
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		defer rows.Close()
		streak := computeStreak(rows)
		if rows.Err() != nil {
			apperr.Write(w, apperr.InternalErr(rows.Err()))
			return
		}
		resp := map[string]any{"data": map[string]any{"streak": streak}}
		cacheSetJSON(st, cacheKey, resp, 60)
		writeJSON(w, resp)
	}
}
