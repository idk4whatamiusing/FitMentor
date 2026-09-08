package services

import (
	"context"
	"encoding/json"
	"time"

	"fitmentor/api/internal/app"

	"github.com/redis/go-redis/v9"
)

const (
	coachLogsStream = "stream:coach:logs"
	coachGroup      = "coach-consumers"
	coachConsumer   = "api-1"
)

func EnsureCoachGroup(client *redis.Client) {
	if client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = client.XGroupCreateMkStream(ctx, coachLogsStream, coachGroup, "$").Err()
}

func PublishCoachLog(client *redis.Client, event map[string]any) {
	if client == nil {
		return
	}
	payload, _ := json.Marshal(event)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = client.XAdd(ctx, &redis.XAddArgs{
		Stream: coachLogsStream,
		ID:     "*",
		Values: map[string]any{"payload": string(payload)},
	}).Err()
}

type coachLogEvent struct {
	UserID       string          `json:"user_id"`
	ContainerTag string          `json:"container_tag"`
	UserMessage  string          `json:"user_message"`
	Reply        string          `json:"reply"`
	Tier         string          `json:"tier"`
	Messages     json.RawMessage `json:"messages"`
	SessionID    *string         `json:"session_id"`
}

// ConsumeCoachLogs mirrors services/streams.rs: blocking XREADGROUP loop,
// DB upsert + chat session update, ingest forward, XACK per message.
func ConsumeCoachLogs(st *app.State, ingestURL string) {
	client := st.Cache.Client()
	if client == nil {
		return
	}
	for {
		streams, err := client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
			Group:    coachGroup,
			Consumer: coachConsumer,
			Streams:  []string{coachLogsStream, ">"},
			Count:    10,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			continue
		}
		for _, s := range streams {
			for _, msg := range s.Messages {
				raw, _ := msg.Values["payload"].(string)
				var event coachLogEvent
				if err := json.Unmarshal([]byte(raw), &event); err != nil {
					continue
				}
				processCoachLog(st, &event, ingestURL)
				_ = client.XAck(context.Background(), coachLogsStream, coachGroup, msg.ID).Err()
			}
		}
	}
}

func processCoachLog(st *app.State, event *coachLogEvent, ingestURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = st.Pool.Exec(ctx,
		`INSERT INTO coach_logs (user_id, container_tag) VALUES ($1, $2)
		 ON CONFLICT (user_id, container_tag) DO NOTHING`,
		event.UserID, event.ContainerTag)

	if event.SessionID != nil && *event.SessionID != "" {
		var msgs []any
		if len(event.Messages) > 0 {
			_ = json.Unmarshal(event.Messages, &msgs)
		}
		msgs = append(msgs, map[string]string{"role": "assistant", "content": event.Reply})
		encoded, _ := json.Marshal(msgs)
		_, _ = st.Pool.Exec(ctx,
			`UPDATE chat_sessions SET messages = $1, updated_at = NOW()
			 WHERE id = CAST($2 AS uuid) AND user_id = $3`,
			string(encoded), *event.SessionID, event.UserID)
	}

	ForwardIngest(ingestURL,
		event.ContainerTag,
		"User: "+event.UserMessage+"\nCoach: "+event.Reply,
		event.Tier)
}
