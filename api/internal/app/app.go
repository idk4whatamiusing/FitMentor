// Package app holds the shared application state (mirrors AppState in main.rs).
package app

import (
	"fitmentor/api/internal/auth/jwt"
	"fitmentor/api/internal/cache"

	"github.com/jackc/pgx/v5/pgxpool"
)

type State struct {
	Pool                  *pgxpool.Pool
	Cache                 *cache.Service
	JWT                   *jwt.JWTValidator
	PolarAccessToken      string
	PolarWebhookSecret    string
	PolarPremiumProductID string
	PolarPremiumPriceID   string
	PolarProProductID     string
	PolarProPriceID       string
	APISharedSecret       string
	PlannerURL            string
	AppURL                string
	CORSOrigin            string
}
