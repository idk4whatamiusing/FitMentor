// Command server is the FitMentor Go API (port of the Rust Axum service).
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/auth/jwt"
	"fitmentor/api/internal/cache"
	"fitmentor/api/internal/config"
	"fitmentor/api/internal/db"
	"fitmentor/api/internal/graph"
	"fitmentor/api/internal/server"
	"fitmentor/api/internal/services"
)

func main() {
	cfg := config.FromEnv()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := db.EnsureSchema(context.Background(), pool); err != nil {
		log.Fatalf("schema setup failed: %v", err)
	}
	log.Println("migrations complete")

	c := cache.New(cfg.RedisURL)
	validator := jwt.NewJWTValidator(cfg.CFTeamDomain, cfg.CFAud, cfg.JWTSecret)

	if client := c.Client(); client != nil {
		services.EnsureCoachGroup(client)
		ingestURL := os.Getenv("INGEST_URL")
		if ingestURL == "" {
			ingestURL = "http://ws:8080"
		}
		st := &app.State{Pool: pool, Cache: c}
		go services.ConsumeCoachLogs(st, ingestURL)
	}

	st := &app.State{
		Pool:                  pool,
		Cache:                 c,
		JWT:                   validator,
		PolarAccessToken:      cfg.PolarAccessToken,
		PolarWebhookSecret:    cfg.PolarWebhookSecret,
		PolarPremiumProductID: cfg.PolarPremiumProductID,
		PolarPremiumPriceID:   cfg.PolarPremiumPriceID,
		PolarProProductID:     cfg.PolarProProductID,
		PolarProPriceID:       cfg.PolarProPriceID,
		APISharedSecret:       cfg.APISharedSecret,
		PlannerURL:            cfg.PlannerURL,
		AppURL:                cfg.AppURL,
		CORSOrigin:            cfg.CORSOrigin,
	}

	schema, err := graph.NewSchema(st)
	if err != nil {
		log.Fatalf("invalid GraphQL schema: %v", err)
	}

	addr := fmt.Sprintf("0.0.0.0:%d", cfg.Port)
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, server.NewRouter(st, schema)); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
