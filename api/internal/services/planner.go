// Package services holds outbound integrations: planner trigger, ingest
// forwarding, Polar.sh, and the Redis Streams coach-log consumer.
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// TriggerGenerate mirrors the fire-and-forget POST {PLANNER_URL}/generate in
// routes/user.rs and graphql/mutations.rs (120s timeout, warn on error).
func TriggerGenerate(plannerURL, userID string) {
	go func() {
		body, _ := json.Marshal(map[string]string{"user_id": userID})
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, plannerURL+"/generate", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if _, err := http.DefaultClient.Do(req); err != nil {
			log.Printf("failed to trigger planner for user %s: %v", userID, err)
		}
	}()
}

// ForwardIngest mirrors the fire-and-forget POST {INGEST_URL}/v1/ingest in
// routes/coach_log.rs and services/streams.rs.
func ForwardIngest(ingestURL, containerTag, content, tier string) {
	go func() {
		body, _ := json.Marshal(map[string]string{
			"container_tag": containerTag,
			"content":       content,
			"tier":          tier,
		})
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, ingestURL+"/v1/ingest", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			resp.Body.Close()
		}
	}()
}
