// Package server assembles the chi router: REST routes from routes/mod.rs,
// the /graphql endpoint, CORS from main.rs, and the GraphiQL IDE page.
package server

import (
	"encoding/json"
	"io"
	"net/http"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/auth"
	"fitmentor/api/internal/graph"
	"fitmentor/api/internal/handlers"

	"github.com/go-chi/chi/v5"
	graphql "github.com/graph-gophers/graphql-go"
)

func NewRouter(st *app.State, schema *graphql.Schema) http.Handler {
	r := chi.NewRouter()
	r.Use(corsMiddleware(st.CORSOrigin))

	r.Get("/v1/health", handlers.Health)

	// Public: user sync (own x-api-key check), polar webhook (own HMAC check).
	r.Post("/v1/user/sync", handlers.SyncUser(st))
	r.Post("/v1/webhooks/polar", handlers.PolarWebhook(st))

	// Authenticated REST (auth.Middleware mirrors FromRequestParts).
	authed := chi.NewRouter()
	authed.Use(func(next http.Handler) http.Handler { return auth.Middleware(st, next) })
	authed.Get("/user/me", handlers.GetMe(st))
	authed.Get("/user/exists", handlers.CheckUserExists(st))
	authed.Put("/user/profile", handlers.UpdateProfile(st))
	authed.Put("/user/profile/protein-target", handlers.UpdateProteinTarget(st))
	authed.Get("/logs/today", handlers.GetTodayLog(st))
	authed.Put("/logs/today", handlers.UpsertTodayLog(st))
	authed.Get("/logs", handlers.GetLogsRange(st))
	authed.Get("/logs/streak", handlers.GetStreak(st))
	authed.Get("/coach/sessions", handlers.ListCoachSessions(st))
	authed.Post("/coach/sessions", handlers.CreateCoachSession(st))
	authed.Get("/coach/sessions/{id}", handlers.GetCoachSession(st))
	authed.Delete("/coach/sessions/{id}", handlers.DeleteCoachSession(st))
	authed.Post("/coach/log", handlers.CoachLog(st))
	authed.Get("/meal/today", handlers.GetPlan("meal_plans", st))
	authed.Put("/meal/today", handlers.UpsertPlan("meal_plans", st))
	authed.Get("/workout/today", handlers.GetPlan("workout_plans", st))
	authed.Put("/workout/today", handlers.UpsertPlan("workout_plans", st))
	authed.Get("/tools/bmi-advice", handlers.GetPlan("bmi_advice", st))
	authed.Put("/tools/bmi-advice", handlers.UpsertPlan("bmi_advice", st))
	authed.Get("/tools/sleep-advice", handlers.GetPlan("sleep_advice", st))
	authed.Put("/tools/sleep-advice", handlers.UpsertPlan("sleep_advice", st))
	authed.Get("/tools/injury-advice", handlers.GetPlan("injury_advice", st))
	authed.Put("/tools/injury-advice", handlers.UpsertPlan("injury_advice", st))
	authed.Get("/tools/form-advice", handlers.GetPlan("form_advice", st))
	authed.Put("/tools/form-advice", handlers.UpsertPlan("form_advice", st))
	authed.Post("/workout/complete", handlers.CompleteWorkout(st))
	authed.Get("/workout/completions", handlers.ListWorkoutCompletions(st))
	authed.Post("/subscriptions/checkout", handlers.CreateCheckout(st))
	authed.Post("/internal/quota/check-and-consume", handlers.CheckAndConsume(st))
	r.Mount("/v1", authed)

	// GraphQL (own auth extraction incl. session cookies).
	r.Get("/graphql", serveGraphiQL)
	r.Post("/graphql", graphqlHandler(st, schema))

	return r
}

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers",
				"Authorization, Content-Type, Accept, Cookie, Set-Cookie, "+
					"cf-access-jwt-assertion, x-api-key, x-user-id, x-user-email")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func graphqlHandler(st *app.State, schema *graphql.Schema) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var req struct {
			Query         string         `json:"query"`
			Variables     map[string]any `json:"variables"`
			OperationName string         `json:"operationName"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		ctx := r.Context()
		if user := auth.ExtractAuthUser(st, r); user != nil {
			ctx = graph.ContextWithUser(ctx, user)
		}
		resp := schema.Exec(ctx, req.Query, req.OperationName, req.Variables)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func serveGraphiQL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.WriteString(w, `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>GraphiQL</title>
<link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css"/>
</head><body style="margin:0"><div id="graphiql" style="height:100vh"></div>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
<script>ReactDOM.createRoot(document.getElementById('graphiql')).render(
React.createElement(GraphiQL, {fetcher: GraphiQL.createFetcher({url: '/graphql'})}));</script>
</body></html>`)
}
