package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"

	"github.com/redis/go-redis/v9"
)

const totalPool = 10000.0

var tierMultiplier = map[string]float64{"free": 1.0, "pro": 1.4, "premium": 2.0}

func tierIdx(tier string) string {
	if tier == "pro" || tier == "premium" {
		return tier
	}
	return "free"
}

// CheckAndConsume mirrors routes/internal.rs (dynamic fair-share quota).
func CheckAndConsume(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := authedUser(r)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		var req struct {
			Tier string `json:"tier"`
		}
		if err := decodeJSON(r, &req); err != nil {
			apperr.Write(w, err)
			return
		}
		client := st.Cache.Client()
		if client == nil {
			apperr.Write(w, apperr.InternalErr(errors.New("Redis unavailable")))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		userID := auth.UserID
		today := todayString()
		tier := tierIdx(req.Tier)

		wasNew, err := client.SetNX(ctx, "quota:ai:seen:"+userID+":"+today, "1", 24*time.Hour).Result()
		if err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		if wasNew {
			activeKey := "quota:ai:active:" + tier
			if err := client.Incr(ctx, activeKey).Err(); err != nil {
				apperr.Write(w, apperr.InternalErr(err))
				return
			}
			_ = client.Expire(ctx, activeKey, 24*time.Hour).Err()
		}

		free := redisInt(client, ctx, "quota:ai:active:free")
		pro := redisInt(client, ctx, "quota:ai:active:pro")
		premium := redisInt(client, ctx, "quota:ai:active:premium")

		weighted := free*tierMultiplier["free"] + pro*tierMultiplier["pro"] + premium*tierMultiplier["premium"]
		limit := uint64(totalPool)
		if weighted > 0 {
			limit = uint64(totalPool * tierMultiplier[tier] / weighted)
		}

		usageKey := "quota:ai:user:" + userID + ":" + today
		used := uint64(redisInt(client, ctx, usageKey))
		if used >= limit {
			writeJSON(w, map[string]any{"allowed": false, "limit": limit, "used": used})
			return
		}
		if err := client.Incr(ctx, usageKey).Err(); err != nil {
			apperr.Write(w, apperr.InternalErr(err))
			return
		}
		_ = client.Expire(ctx, usageKey, 24*time.Hour).Err()
		writeJSON(w, map[string]any{"allowed": true, "limit": limit, "used": used + 1})
	}
}

func redisInt(client *redis.Client, ctx context.Context, key string) float64 {
	v, err := client.Get(ctx, key).Result()
	if err != nil {
		return 0
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0
	}
	return f
}
