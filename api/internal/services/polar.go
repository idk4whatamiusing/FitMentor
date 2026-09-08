package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
)

// CreateCheckout mirrors routes/payments.rs checkout.
func CreateCheckout(st *app.State, userID, tier string) (string, error) {
	if tier != "premium" && tier != "pro" {
		return "", apperr.BadRequestf("Invalid tier. Must be 'premium' or 'pro'.")
	}
	productID := st.PolarPremiumProductID
	if tier == "pro" {
		productID = st.PolarProProductID
	}
	if st.PolarAccessToken == "" || productID == "" {
		return "", apperr.BadRequestf("Polar.sh not configured. Set POLAR_ACCESS_TOKEN and product IDs.")
	}
	body, _ := json.Marshal(map[string]any{
		"products":    []string{productID},
		"success_url": "https://fitmentor-ey9.pages.dev/profile?checkout=success",
		"metadata":    map[string]string{"user_id": userID, "tier": tier},
	})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.polar.sh/v1/checkouts/", bytes.NewReader(body))
	if err != nil {
		return "", apperr.InternalErr(err)
	}
	req.Header.Set("Authorization", "Bearer "+st.PolarAccessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", apperr.InternalErr(fmt.Errorf("Polar API error: %w", err))
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", apperr.BadRequestf(fmt.Sprintf("Polar checkout failed: %s", string(respBody)))
	}
	var data struct {
		URL         string `json:"url"`
		CheckoutURL string `json:"checkout_url"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		return "", apperr.InternalErr(fmt.Errorf("Failed to parse Polar response: %w", err))
	}
	url := data.URL
	if url == "" {
		url = data.CheckoutURL
	}
	if url == "" {
		return "", apperr.InternalErr(fmt.Errorf("No checkout URL in Polar response"))
	}
	return url, nil
}

// VerifyWebhookSignature mirrors the HMAC check in webhook_handler.
// Empty secret skips verification, exactly like the Rust version.
func VerifyWebhookSignature(secret string, headers http.Header, body []byte) error {
	if secret == "" {
		return nil
	}
	sig := headers.Get("polar-signature")
	if sig == "" {
		return apperr.UnauthorizedErr()
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	provided := strings.TrimPrefix(sig, "sha256=")
	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return apperr.UnauthorizedErr()
	}
	return nil
}

// HandlePolarEvent mirrors the match in webhook_handler.
func HandlePolarEvent(ctx context.Context, st *app.State, payload map[string]any) error {
	eventType, _ := payload["type"].(string)
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		return nil
	}
	switch eventType {
	case "subscription.created", "subscription.active", "order.paid":
		return processSubscriptionEvent(ctx, st, data)
	case "subscription.canceled":
		return updateSubscriptionStatus(ctx, st, data, "canceled")
	case "subscription.revoked":
		return updateSubscriptionStatus(ctx, st, data, "revoked")
	case "subscription.updated":
		return updateSubscriptionPeriod(ctx, st, data)
	default:
		return nil
	}
}

func strField(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func processSubscriptionEvent(ctx context.Context, st *app.State, data map[string]any) error {
	polarSubID := strField(data, "id")
	status := strField(data, "status")
	if status == "" {
		status = "active"
	}
	productID := strField(data, "product_id")
	priceID := strField(data, "price_id")
	periodStart := strField(data, "current_period_start")
	periodEnd := strField(data, "current_period_end")
	cancelAtEnd, _ := data["cancel_at_period_end"].(bool)

	tier := "free"
	switch {
	case productID == st.PolarPremiumProductID || priceID == st.PolarPremiumPriceID:
		tier = "premium"
	case productID == st.PolarProProductID || priceID == st.PolarProPriceID:
		tier = "pro"
	}

	meta, _ := data["metadata"].(map[string]any)
	userIDStr := strField(meta, "user_id")
	var userUUID *string
	if userIDStr == "" {
		if email := strField(data, "user_email"); email != "" {
			var id string
			if err := st.Pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&id); err == nil {
				userUUID = &id
			}
		}
	} else {
		var id string
		if err := st.Pool.QueryRow(ctx, `SELECT id FROM users WHERE cf_access_sub = $1`, userIDStr).Scan(&id); err == nil {
			userUUID = &id
		}
	}
	if userUUID == nil {
		return nil
	}
	return upsertSubscription(ctx, st, *userUUID, polarSubID, productID, priceID, tier, status, periodStart, periodEnd, cancelAtEnd)
}

func upsertSubscription(ctx context.Context, st *app.State, userID, polarSubID, productID, priceID, tier, status, periodStart, periodEnd string, cancelAtEnd bool) error {
	var exists bool
	if err := st.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = $1)`, userID).Scan(&exists); err != nil {
		return apperr.InternalErr(err)
	}
	if exists {
		_, err := st.Pool.Exec(ctx,
			`UPDATE subscriptions SET polar_sub_id = $2, polar_product_id = $3, polar_price_id = $4,
			 tier = $5, status = $6, current_period_start = $7::timestamptz,
			 current_period_end = $8::timestamptz, cancel_at_period_end = $9, updated_at = now()
			 WHERE user_id = $1`,
			userID, polarSubID, productID, priceID, tier, status,
			nullIfEmpty(periodStart), nullIfEmpty(periodEnd), cancelAtEnd)
		return errOrInternal(err)
	}
	_, err := st.Pool.Exec(ctx,
		`INSERT INTO subscriptions (user_id, polar_sub_id, polar_product_id, polar_price_id, tier, status,
		 current_period_start, current_period_end, cancel_at_period_end)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9)`,
		userID, polarSubID, productID, priceID, tier, status,
		nullIfEmpty(periodStart), nullIfEmpty(periodEnd), cancelAtEnd)
	return errOrInternal(err)
}

func updateSubscriptionStatus(ctx context.Context, st *app.State, data map[string]any, status string) error {
	if id := strField(data, "id"); id != "" {
		_, err := st.Pool.Exec(ctx,
			`UPDATE subscriptions SET status = $2, updated_at = now() WHERE polar_sub_id = $1`, id, status)
		return errOrInternal(err)
	}
	return nil
}

func updateSubscriptionPeriod(ctx context.Context, st *app.State, data map[string]any) error {
	if id := strField(data, "id"); id != "" {
		cancelAtEnd, _ := data["cancel_at_period_end"].(bool)
		_, err := st.Pool.Exec(ctx,
			`UPDATE subscriptions SET current_period_start = $2::timestamptz,
			 current_period_end = $3::timestamptz, cancel_at_period_end = $4, updated_at = now()
			 WHERE polar_sub_id = $1`,
			id, nullIfEmpty(strField(data, "current_period_start")),
			nullIfEmpty(strField(data, "current_period_end")), cancelAtEnd)
		return errOrInternal(err)
	}
	return nil
}

// nullIfEmpty passes NULL for empty timestamptz strings, mirroring Rust's
// empty-string bind behavior ($N::timestamptz with ” would error, so NULL).
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func errOrInternal(err error) error {
	if err != nil {
		return apperr.InternalErr(err)
	}
	return nil
}
