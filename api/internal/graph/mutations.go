package graph

import (
	"context"
	"strings"

	"fitmentor/api/internal/services"

	"github.com/jackc/pgx/v5"
)

type updateProfileInput struct {
	Name             *string
	Age              *int32
	Gender           *string
	HeightCm         *int32
	WeightKg         *int32
	Goal             *string
	Place            *string
	Experience       *string
	Diet             *string
	DaysPerWeek      *int32
	BudgetPerDay     *int32
	HealthConditions *[]string
}

type updateDailyLogInput struct {
	Water       *int32
	Sleep       *int32
	Steps       *int32
	ProteinG    *int32
	WorkoutDone *bool
	WeightKg    *float64
}

func int32ToInt16(v *int32) any {
	if v == nil {
		return nil
	}
	return int16(*v)
}

func strOrNil(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

func (r *Resolver) UpdateProfile(ctx context.Context, args struct {
	Input updateProfileInput
}) (*profileResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	if args.Input.Name != nil {
		if _, err := r.st.Pool.Exec(ctx,
			`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`,
			u.ID, *args.Input.Name); err != nil {
			return nil, &queryError{msg: err.Error()}
		}
	}
	_, _ = r.st.Pool.Exec(ctx,
		`INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, u.ID)
	p, err := scanProfile(r.st.Pool.QueryRow(ctx,
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
		u.ID, strOrNil(args.Input.Name), int32ToInt16(args.Input.Age),
		strOrNil(args.Input.Gender), int32ToInt16(args.Input.HeightCm),
		int32ToInt16(args.Input.WeightKg), strOrNil(args.Input.Goal),
		strOrNil(args.Input.Place), strOrNil(args.Input.Experience),
		strOrNil(args.Input.Diet), int32ToInt16(args.Input.DaysPerWeek),
		int32ToInt16(args.Input.BudgetPerDay), strSliceOrNil(args.Input.HealthConditions)))
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	r.st.Cache.InvalidateUser(u.ID)
	services.TriggerGenerate(r.st.PlannerURL, auth.UserID)
	return &profileResolver{p: p}, nil
}

func strSliceOrNil(v *[]string) any {
	if v == nil {
		return nil
	}
	return *v
}

func (r *Resolver) UpdateProteinTarget(ctx context.Context, args struct {
	ProteinG *int32
}) (*profileResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	if _, err := r.st.Pool.Exec(ctx,
		`UPDATE profiles SET custom_protein_g = $2, updated_at = now() WHERE user_id = $1`,
		u.ID, int32ToInt16(args.ProteinG)); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	r.st.Cache.InvalidateUser(u.ID)
	p, err := scanProfile(r.st.Pool.QueryRow(ctx,
		`SELECT `+profileColumns+` FROM profiles WHERE user_id = $1`, u.ID))
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return &profileResolver{p: p}, nil
}

func (r *Resolver) UpsertTodayLog(ctx context.Context, args struct {
	Input updateDailyLogInput
}) (*logResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	u, err := getUserByCFSub(ctx, r, auth.UserID)
	if err != nil {
		return nil, err
	}
	var water any = 0
	if args.Input.Water != nil {
		water = *args.Input.Water
	}
	var sleep any = 0
	if args.Input.Sleep != nil {
		sleep = *args.Input.Sleep
	}
	var steps any = 0
	if args.Input.Steps != nil {
		steps = *args.Input.Steps
	}
	var protein any = 0
	if args.Input.ProteinG != nil {
		protein = *args.Input.ProteinG
	}
	var done any = false
	if args.Input.WorkoutDone != nil {
		done = *args.Input.WorkoutDone
	}
	var weight any
	if args.Input.WeightKg != nil {
		weight = *args.Input.WeightKg
	}
	l, err := scanDailyLog(r.st.Pool.QueryRow(ctx,
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
		u.ID, todayUTC(), water, sleep, steps, protein, done, weight))
	if err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	r.st.Cache.InvalidateToday(u.ID)
	return &logResolver{l: l}, nil
}

func (r *Resolver) UpsertAiPlan(ctx context.Context, args struct {
	Table string
	Plan  JSON
}) (*planResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if !validPlanTables[args.Table] {
		return nil, &queryError{msg: "Invalid table name"}
	}
	if _, err := r.st.Pool.Exec(ctx,
		`INSERT INTO `+args.Table+` (user_id, date, plan) VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, date) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
		auth.UserID, todayUTC(), string(args.Plan)); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	var p planRow
	if err := r.st.Pool.QueryRow(ctx,
		`SELECT id, user_id, date, plan FROM `+args.Table+` WHERE user_id = $1 AND date = $2`,
		auth.UserID, todayUTC()).Scan(&p.ID, &p.UserID, &p.Date, &p.Plan); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return &planResolver{p: p}, nil
}

func (r *Resolver) CreateCoachSession(ctx context.Context, args struct {
	Title *string
}) (*sessionResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	title := "New Chat"
	if args.Title != nil {
		title = *args.Title
	}
	var id string
	if err := r.st.Pool.QueryRow(ctx,
		`INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id`,
		auth.UserID, title).Scan(&id); err != nil {
		return nil, &queryError{msg: err.Error()}
	}
	return &sessionResolver{id: id, userID: auth.UserID, title: title, messages: []byte("[]")}, nil
}

func (r *Resolver) DeleteCoachSession(ctx context.Context, args struct {
	Id GQLUUID
}) (bool, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return false, err
	}
	tag, err := r.st.Pool.Exec(ctx,
		`DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`,
		string(args.Id), auth.UserID)
	if err != nil {
		return false, &queryError{msg: err.Error()}
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Resolver) UpdateCoachSessionTitle(ctx context.Context, args struct {
	Id    GQLUUID
	Title string
}) (*sessionResolver, error) {
	auth, err := r.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	clean := strings.TrimSpace(args.Title)
	if len([]rune(clean)) > 40 {
		clean = string([]rune(clean)[:40])
	}
	if clean == "" {
		return nil, &queryError{msg: "Title cannot be empty"}
	}
	var s sessionResolver
	var msgs []byte
	err = r.st.Pool.QueryRow(ctx,
		`UPDATE chat_sessions SET title = $1, updated_at = now()
		 WHERE id = $2 AND user_id = $3
		 RETURNING id, user_id, title, messages`,
		clean, string(args.Id), auth.UserID).Scan(&s.id, &s.userID, &s.title, &msgs)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &queryError{msg: "Session not found"}
		}
		return nil, &queryError{msg: err.Error()}
	}
	s.messages = msgs
	return &s, nil
}
