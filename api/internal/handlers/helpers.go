// Package handlers implements the REST routes from api/src/routes.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
	"fitmentor/api/internal/auth"
	"fitmentor/api/internal/models"

	"github.com/jackc/pgx/v5"
)

func jsonUnmarshalCached(cached string, v any) bool {
	return json.Unmarshal([]byte(cached), v) == nil
}

func cacheSetJSON(st *app.State, key string, v any, ttl int) {
	if raw, err := json.Marshal(v); err == nil {
		st.Cache.Set(key, string(raw), ttl)
	}
}

// mustUserByCFSub mirrors logs.rs get_user_id: missing user → Internal (500),
// unlike user.rs get_user_by_cf_sub which yields NotFound (404).
func mustUserByCFSub(ctx context.Context, st *app.State, cfSub string) (models.User, error) {
	u, err := getUserByCFSub(ctx, st, cfSub)
	if err != nil {
		if ae, ok := err.(*apperr.Error); ok && ae.Kind == apperr.NotFound {
			return u, apperr.InternalErr(err)
		}
		return u, err
	}
	return u, nil
}

func toAnySlice(v any) []any {
	if arr, ok := v.([]any); ok {
		return arr
	}
	return []any{}
}

func jsonMarshalAny(v any) ([]byte, error) { return json.Marshal(v) }

// computeStreak counts consecutive workout days ending today.
func computeStreak(rows pgx.Rows) int32 {
	var streak int32
	expected := todayString()
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			break
		}
		if d.Format("2006-01-02") == expected {
			streak++
			expected = d.AddDate(0, 0, -1).Format("2006-01-02")
		} else {
			break
		}
	}
	return streak
}

func authedUser(r *http.Request) (auth.AuthUser, error) {
	u, ok := auth.FromContext(r.Context())
	if !ok {
		return auth.AuthUser{}, apperr.UnauthorizedErr()
	}
	return u, nil
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return apperr.BadRequestf("invalid json")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, v any) {
	apperr.WriteJSON(w, http.StatusOK, v)
}

func getUserByCFSub(ctx context.Context, st *app.State, cfSub string) (models.User, error) {
	var u models.User
	err := st.Pool.QueryRow(ctx,
		`SELECT id, cf_access_sub, email, name, created_at, updated_at
		 FROM users WHERE cf_access_sub = $1`, cfSub).Scan(
		&u.ID, &u.CFSub, &u.Email, &u.Name, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return u, apperr.NotFoundErr()
		}
		return u, apperr.InternalErr(err)
	}
	return u, nil
}

func upsertUser(ctx context.Context, st *app.State, cfSub, email string) (models.User, error) {
	var u models.User
	err := st.Pool.QueryRow(ctx,
		`INSERT INTO users (cf_access_sub, email) VALUES ($1, $2)
		 ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
		 RETURNING id, cf_access_sub, email, name, created_at, updated_at`,
		cfSub, email).Scan(&u.ID, &u.CFSub, &u.Email, &u.Name, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return u, apperr.InternalErr(err)
	}
	return u, nil
}

func nilIfEmptyString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

func nilIfNilInt16(v *int16) any {
	if v == nil {
		return nil
	}
	return *v
}

func scanProfileRow(s pgx.Row) (models.Profile, error) {
	var p models.Profile
	err := s.Scan(&p.ID, &p.UserID, &p.Name, &p.Age, &p.Gender, &p.HeightCm,
		&p.WeightKg, &p.Goal, &p.Place, &p.Experience, &p.Diet, &p.DaysPerWeek,
		&p.BudgetPerDay, &p.HealthConditions, &p.CustomProteinG, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

const profileColumns = `id, user_id, name, age, gender, height_cm, weight_kg, goal, place,
	experience, diet, days_per_week, budget_per_day, health_conditions,
	custom_protein_g, created_at, updated_at`

func profileToMap(p models.Profile) map[string]any {
	return map[string]any{
		"id": p.ID, "userId": p.UserID, "name": p.Name, "age": p.Age,
		"gender": p.Gender, "heightCm": p.HeightCm, "weightKg": p.WeightKg,
		"goal": p.Goal, "place": p.Place, "experience": p.Experience,
		"diet": p.Diet, "daysPerWeek": p.DaysPerWeek, "budgetPerDay": p.BudgetPerDay,
		"healthConditions": p.HealthConditions, "customProteinG": p.CustomProteinG,
		"createdAt": p.CreatedAt, "updatedAt": p.UpdatedAt,
	}
}

func userToMap(u models.User) map[string]any {
	return map[string]any{
		"id": u.ID, "email": u.Email, "name": u.Name, "created_at": u.CreatedAt,
	}
}

func scanDailyLogRow(s pgx.Row) (models.DailyLog, error) {
	var l models.DailyLog
	var water, sleep, protein int16
	var steps int32
	err := s.Scan(&l.ID, &l.UserID, &l.Date, &water, &sleep, &steps, &protein,
		&l.WorkoutDone, &l.WeightKg, &l.CreatedAt, &l.UpdatedAt)
	l.Water, l.Sleep, l.Steps, l.ProteinG = int32(water), int32(sleep), steps, int32(protein)
	return l, err
}

const dailyLogColumns = `id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
	created_at, updated_at`

func dailyLogToMap(l models.DailyLog) map[string]any {
	return map[string]any{
		"id": l.ID, "userId": l.UserID, "date": l.Date.Format("2006-01-02"),
		"water": l.Water, "sleep": l.Sleep, "steps": l.Steps, "proteinG": l.ProteinG,
		"workoutDone": l.WorkoutDone, "weightKg": l.WeightKg,
		"createdAt": l.CreatedAt, "updatedAt": l.UpdatedAt,
	}
}

func todayDate() time.Time { return time.Now().UTC().Truncate(24 * time.Hour) }

func todayString() string { return time.Now().UTC().Format("2006-01-02") }
