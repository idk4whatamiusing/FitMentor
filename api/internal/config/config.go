// Package config loads service configuration from the environment.
// Variable names and defaults mirror the original Rust config.rs.
package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL           string
	RedisURL              string
	CFTeamDomain          string
	CFAud                 string
	Port                  uint16
	PolarAccessToken      string
	PolarWebhookSecret    string
	PolarPremiumProductID string
	PolarPremiumPriceID   string
	PolarProProductID     string
	PolarProPriceID       string
	APISharedSecret       string
	PlannerURL            string
	IngestURL             string
	CORSOrigin            string
	AppURL                string
	JWTSecret             string
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	// Fall back to default only when unset/empty, except vars where
	// empty is meaningful (those use os.Getenv directly below).
	_ = def
	if _, ok := os.LookupEnv(key); ok {
		return os.Getenv(key)
	}
	return def
}

func FromEnv() Config {
	port := uint16(3000)
	if raw := os.Getenv("PORT"); raw != "" {
		if p, err := strconv.Atoi(raw); err == nil && p > 0 && p < 65536 {
			port = uint16(p)
		}
	}
	return Config{
		DatabaseURL:           mustEnv("DATABASE_URL"),
		RedisURL:              envOr("REDIS_URL", "redis://localhost:6379"),
		CFTeamDomain:          envOr("CF_ACCESS_TEAM_DOMAIN", "your-team.cloudflareaccess.com"),
		CFAud:                 envOr("CF_ACCESS_AUD", "your-aud-tag"),
		Port:                  port,
		PolarAccessToken:      os.Getenv("POLAR_ACCESS_TOKEN"),
		PolarWebhookSecret:    os.Getenv("POLAR_WEBHOOK_SECRET"),
		PolarPremiumProductID: os.Getenv("POLAR_PREMIUM_PRODUCT_ID"),
		PolarPremiumPriceID:   os.Getenv("POLAR_PREMIUM_PRICE_ID"),
		PolarProProductID:     os.Getenv("POLAR_PRO_PRODUCT_ID"),
		PolarProPriceID:       os.Getenv("POLAR_PRO_PRICE_ID"),
		APISharedSecret:       os.Getenv("API_SHARED_SECRET"),
		PlannerURL:            envOr("PLANNER_URL", "http://planner:8002"),
		IngestURL:             envOr("INGEST_URL", "http://ws:8080"),
		CORSOrigin:            envOr("CORS_ORIGIN", "https://fitmentor-ey9.pages.dev"),
		AppURL:                envOr("APP_URL", "https://fitmentor-ey9.pages.dev"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(key + " must be set")
	}
	return v
}
