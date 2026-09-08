package graph

import (
	"context"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/auth"
	"fitmentor/api/internal/models"

	graphql "github.com/graph-gophers/graphql-go"
	"github.com/jackc/pgx/v5"
)

// Resolver is the GraphQL root. The per-request user comes from the context
// (see ContextWithUser); resolvers enforce require_user like
// GqlContext::require_user.
type Resolver struct {
	st *app.State
}

func NewSchema(st *app.State) (*graphql.Schema, error) {
	return graphql.ParseSchema(schemaSDL, &Resolver{st: st})
}

func (r *Resolver) requireUser(ctx context.Context) (*auth.AuthUser, error) {
	if u := userFromCtx(ctx); u != nil {
		return u, nil
	}
	return nil, errUnauthorized()
}

func errUnauthorized() error { return &queryError{msg: "Unauthorized"} }

type queryError struct{ msg string }

func (e *queryError) Error() string { return e.msg }

// ---- shared DB helpers (mirror queries.rs/mutations.rs get_user_id) ----

func getUserByCFSub(ctx context.Context, r *Resolver, cfSub string) (models.User, error) {
	var u models.User
	err := r.st.Pool.QueryRow(ctx,
		`SELECT id, cf_access_sub, email, name, created_at, updated_at
		 FROM users WHERE cf_access_sub = $1`, cfSub).Scan(
		&u.ID, &u.CFSub, &u.Email, &u.Name, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return u, &queryError{msg: err.Error()}
	}
	return u, nil
}

const profileColumns = `id, user_id, name, age, gender, height_cm, weight_kg, goal, place,
	experience, diet, days_per_week, budget_per_day, health_conditions,
	custom_protein_g, created_at, updated_at`

func scanProfile(row pgx.Row) (models.Profile, error) {
	var p models.Profile
	err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.Age, &p.Gender, &p.HeightCm,
		&p.WeightKg, &p.Goal, &p.Place, &p.Experience, &p.Diet, &p.DaysPerWeek,
		&p.BudgetPerDay, &p.HealthConditions, &p.CustomProteinG, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

const dailyLogColumns = `id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
	created_at, updated_at`

func scanDailyLog(row pgx.Row) (models.DailyLog, error) {
	var l models.DailyLog
	var water, sleep, protein int16
	var steps int32
	err := row.Scan(&l.ID, &l.UserID, &l.Date, &water, &sleep, &steps, &protein,
		&l.WorkoutDone, &l.WeightKg, &l.CreatedAt, &l.UpdatedAt)
	l.Water, l.Sleep, l.Steps, l.ProteinG = int32(water), int32(sleep), steps, int32(protein)
	return l, err
}

func fmtDate(t time.Time) GQLDate         { return GQLDate(t.Format("2006-01-02")) }
func fmtDateTime(t time.Time) GQLDateTime { return GQLDateTime(t.UTC().Format(time.RFC3339)) }

func nilStr(s *string) *string { return s }

func int16ptrToInt32(v *int16) *int32 {
	if v == nil {
		return nil
	}
	n := int32(*v)
	return &n
}

func timePtrToGQL(t *time.Time) *GQLDateTime {
	if t == nil {
		return nil
	}
	g := fmtDateTime(*t)
	return &g
}

func float32PtrTo64(v *float32) *float64 {
	if v == nil {
		return nil
	}
	f := float64(*v)
	return &f
}

// ---- object resolvers ----

type userResolver struct{ u models.User }

func (r *userResolver) Id() GQLUUID            { return GQLUUID(r.u.ID) }
func (r *userResolver) CfAccessSub() string    { return r.u.CFSub }
func (r *userResolver) Email() string          { return r.u.Email }
func (r *userResolver) Name() *string          { return nilStr(r.u.Name) }
func (r *userResolver) CreatedAt() GQLDateTime { return fmtDateTime(r.u.CreatedAt) }
func (r *userResolver) UpdatedAt() GQLDateTime { return fmtDateTime(r.u.UpdatedAt) }

type profileResolver struct{ p models.Profile }

func (r *profileResolver) Id() GQLUUID          { return GQLUUID(r.p.ID) }
func (r *profileResolver) UserId() GQLUUID      { return GQLUUID(r.p.UserID) }
func (r *profileResolver) Name() *string        { return nilStr(r.p.Name) }
func (r *profileResolver) Age() *int32          { return int16ptrToInt32(r.p.Age) }
func (r *profileResolver) Gender() *string      { return nilStr(r.p.Gender) }
func (r *profileResolver) HeightCm() *int32     { return int16ptrToInt32(r.p.HeightCm) }
func (r *profileResolver) WeightKg() *int32     { return int16ptrToInt32(r.p.WeightKg) }
func (r *profileResolver) Goal() *string        { return nilStr(r.p.Goal) }
func (r *profileResolver) Place() *string       { return nilStr(r.p.Place) }
func (r *profileResolver) Experience() *string  { return nilStr(r.p.Experience) }
func (r *profileResolver) Diet() *string        { return nilStr(r.p.Diet) }
func (r *profileResolver) DaysPerWeek() *int32  { return int16ptrToInt32(r.p.DaysPerWeek) }
func (r *profileResolver) BudgetPerDay() *int32 { return int16ptrToInt32(r.p.BudgetPerDay) }
func (r *profileResolver) HealthConditions() *[]string {
	if r.p.HealthConditions == nil {
		return nil
	}
	return &r.p.HealthConditions
}
func (r *profileResolver) CustomProteinG() *int32  { return int16ptrToInt32(r.p.CustomProteinG) }
func (r *profileResolver) CreatedAt() *GQLDateTime { return timePtrToGQL(r.p.CreatedAt) }
func (r *profileResolver) UpdatedAt() *GQLDateTime { return timePtrToGQL(r.p.UpdatedAt) }

type logResolver struct{ l models.DailyLog }

func (r *logResolver) Id() GQLUUID             { return GQLUUID(r.l.ID) }
func (r *logResolver) UserId() GQLUUID         { return GQLUUID(r.l.UserID) }
func (r *logResolver) Date() GQLDate           { return fmtDate(r.l.Date) }
func (r *logResolver) Water() int32            { return r.l.Water }
func (r *logResolver) Sleep() int32            { return r.l.Sleep }
func (r *logResolver) Steps() int32            { return r.l.Steps }
func (r *logResolver) ProteinG() int32         { return r.l.ProteinG }
func (r *logResolver) WorkoutDone() bool       { return r.l.WorkoutDone }
func (r *logResolver) WeightKg() *float64      { return float32PtrTo64(r.l.WeightKg) }
func (r *logResolver) CreatedAt() *GQLDateTime { return timePtrToGQL(r.l.CreatedAt) }
func (r *logResolver) UpdatedAt() *GQLDateTime { return timePtrToGQL(r.l.UpdatedAt) }

type planRow struct {
	ID     string
	UserID string
	Date   time.Time
	Plan   []byte
}

type planResolver struct{ p planRow }

func (r *planResolver) Id() GQLUUID    { return GQLUUID(r.p.ID) }
func (r *planResolver) UserId() string { return r.p.UserID }
func (r *planResolver) Date() GQLDate  { return fmtDate(r.p.Date) }
func (r *planResolver) Plan() JSON     { return JSON(r.p.Plan) }

type sessionResolver struct {
	id       string
	userID   string
	title    string
	messages []byte
}

func (r *sessionResolver) Id() GQLUUID    { return GQLUUID(r.id) }
func (r *sessionResolver) UserId() string { return r.userID }
func (r *sessionResolver) Title() string  { return r.title }
func (r *sessionResolver) Messages() JSON { return JSON(r.messages) }

type sessionItemResolver struct {
	id           string
	title        string
	messageCount int32
}

func (r *sessionItemResolver) Id() GQLUUID         { return GQLUUID(r.id) }
func (r *sessionItemResolver) Title() string       { return r.title }
func (r *sessionItemResolver) MessageCount() int32 { return r.messageCount }

type streakResolver struct{ current int32 }

func (r *streakResolver) Current() int32 { return r.current }
func (r *streakResolver) Longest() int32 { return r.current }

type userWithProfileResolver struct {
	u models.User
	p *models.Profile
}

func (r *userWithProfileResolver) User() *userResolver { return &userResolver{u: r.u} }
func (r *userWithProfileResolver) Profile() *profileResolver {
	if r.p == nil {
		return nil
	}
	return &profileResolver{p: *r.p}
}
