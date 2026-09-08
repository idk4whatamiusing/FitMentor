// Package cache mirrors services/cache.rs: a Redis client that degrades to
// no-op when Redis is unavailable, plus user/today invalidation helpers.
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	client *redis.Client
}

func New(redisURL string) *Service {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return &Service{}
	}
	c := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Ping(ctx).Err(); err != nil {
		_ = c.Close()
		return &Service{}
	}
	return &Service{client: c}
}

func (s *Service) Client() *redis.Client { return s.client }

func (s *Service) Get(key string) (string, bool) {
	if s.client == nil {
		return "", false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	v, err := s.client.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return v, true
}

func (s *Service) Set(key, value string, ttlSecs int) {
	if s.client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.client.Set(ctx, key, value, time.Duration(ttlSecs)*time.Second).Err()
}

func (s *Service) Delete(key string) {
	if s.client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.client.Del(ctx, key).Err()
}

func (s *Service) InvalidateUser(userID string) {
	s.Delete("cache:user:" + userID)
	s.Delete("cache:profile:" + userID)
}

func (s *Service) InvalidateToday(userID string) {
	s.Delete("cache:today:" + userID)
}
