package graph

import (
	"context"
	"encoding/json"
	"time"

	"fitmentor/api/internal/models"

	"github.com/jackc/pgx/v5"
)

func (r *Resolver) Me(ctx context.Context) (*userWithProfileResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	var u models.User
	if err := r.st.Pool.QueryRow(ctx,
		`INSERT INTO users (cf_access_sub, email) VALUES ($1, $2)
		 ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
		 RETURNING id, cf_access_sub, email, name, created_at, updated_at`,
		auth.UserID, auth.Email).Scan(
		&u.ID, &u.CFSub, &u.Email, &u.Name, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	_, _ = r.st.Pool.Exec(ctx,
		`INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, u.ID)
	var p *models.Profile
	if prof, err := scanProfile(r.st.Pool.QueryRow(ctx,
		`SELECT `+profileColumns+` FROM profiles WHERE user_id = $1`, u.ID)); err == nil {
		p = &prof
	} else if err != pgx.ErrNoRows {
		return nil, &queryError{msg: err.Error()}
	}
	return &userWithProfileResolver{u: u, p: p}, nil
}

func (r *Resolver) UserExists(ctx context.Context) (bool, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return false, err
	}
	var exists bool
	if err := r.st.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE cf_access_sub = $1)`, auth.UserID).Scan(&exists); err != nil {
		return false, &queryError{msg: err.Error()}
	}
	return exists, nil
}

func (r *Resolver) TodayLog(ctx context.Context) (*logResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	l, err := scanDailyLog(r.st.Pool.QueryRow(ctx,
		`SELECT `+dailyLogColumns+` FROM daily_logs WHERE user_id = $1 AND date = $2`,
		u.ID, todayUTC()))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, &queryError{msg: err.Error()}
	}
	return &logResolver{l: l}, nil
}

func (r *Resolver) Logs(ctx context.Context, args struct {
	Input struct {
		From GQLDate
		To   GQLDate
	}
}) ([]*logResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	rows, err := r.st.Pool.Query(ctx,
		`SELECT `+dailyLogColumns+` FROM daily_logs
		 WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC`,
		u.ID, string(args.Input.From), string(args.Input.To))
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	defer rows.Close()
	out := []*logResolver{}
	for rows.Next() {
		l, err := scanDailyLog(rows)
		if err != nil {
			return nil, &queryError{msg: err.Error()}
		}
		out = append(out, &logResolver{l: l})
	}
	if err := rows.Err(); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return out, nil
}

func (r *Resolver) Streak(ctx context.Context) (*streakResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	rows, err := r.st.Pool.Query(ctx,
		`SELECT date FROM daily_logs WHERE user_id = $1 AND workout_done = true
		 ORDER BY date DESC LIMIT 100`, u.ID)
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	defer rows.Close()
	var current int32
	expected := time.Now().UTC().Format("2006-01-02")
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			break
		}
		if d.Format("2006-01-02") == expected {
			current++
			expected = d.AddDate(0, 0, -1).Format("2006-01-02")
		} else {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return &streakResolver{current: current}, nil
}

var validPlanTables = map[string]bool{
	"meal_plans": true, "workout_plans": true, "bmi_advice": true,
	"sleep_advice": true, "injury_advice": true, "form_advice": true,
}

func (r *Resolver) TodayAiPlan(ctx context.Context, args struct{ Table string }) (*planResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if !validPlanTables[args.Table] {
		return nil, &queryError{msg: "Invalid table name"}
	}
	var p planRow
	err = r.st.Pool.QueryRow(ctx,
		`SELECT id, user_id, date, plan FROM `+args.Table+` WHERE user_id = $1 AND date = $2`,
		auth.UserID, todayUTC()).Scan(&p.ID, &p.UserID, &p.Date, &p.Plan)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, &queryError{msg: err.Error()}
	}
	return &planResolver{p: p}, nil
}

func (r *Resolver) CoachSessions(ctx context.Context) ([]*sessionItemResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := r.st.Pool.Query(ctx,
		`SELECT id, title, messages FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC`,
		auth.UserID)
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	defer rows.Close()
	out := []*sessionItemResolver{}
	for rows.Next() {
		var id, title string
		var msgs []byte
		if err := rows.Scan(&id, &title, &msgs); err != nil {
			return nil, &queryError{msg: err.Error()}
		}
		out = append(out, &sessionItemResolver{id: id, title: title, messageCount: messageCount(msgs)})
	}
	if err := rows.Err(); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return out, nil
}

func (r *Resolver) CoachSession(ctx context.Context, args struct{ Id GQLUUID }) (*sessionResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	var s sessionResolver
	var msgs []byte
	err = r.st.Pool.QueryRow(ctx,
		`SELECT id, user_id, title, messages FROM chat_sessions WHERE id = $1 AND user_id = $2`,
		string(args.Id), auth.UserID).Scan(&s.id, &s.userID, &s.title, &msgs)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, &queryError{msg: err.Error()}
	}
	s.messages = msgs
	return &s, nil
}

func todayUTC() time.Time { return time.Now().UTC().Truncate(24 * time.Hour) }

func messageCount(msgs []byte) int32 {
	var arr []any
	if err := json.Unmarshal(msgs, &arr); err != nil {
		return 0
	}
	return int32(len(arr))
}
