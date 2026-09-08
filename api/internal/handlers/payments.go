package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"fitmentor/api/internal/app"
	"fitmentor/api/internal/apperr"
	"fitmentor/api/internal/services"
)

func CreateCheckout(st *app.State) http.HandlerFunc {
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
		url, err := services.CreateCheckout(st, auth.UserID, req.Tier)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		writeJSON(w, map[string]any{"checkout_url": url})
	}
}

// PolarWebhook mirrors webhook_handler (public route, own HMAC check).
func PolarWebhook(st *app.State) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			apperr.Write(w, apperr.BadRequestf(err.Error()))
			return
		}
		if err := services.VerifyWebhookSignature(st.PolarWebhookSecret, r.Header, body); err != nil {
			apperr.Write(w, err)
			return
		}
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			apperr.Write(w, apperr.BadRequestf(err.Error()))
			return
		}
		if err := services.HandlePolarEvent(r.Context(), st, payload); err != nil {
			apperr.Write(w, err)
			return
		}
		writeJSON(w, map[string]any{"received": true})
	}
}
