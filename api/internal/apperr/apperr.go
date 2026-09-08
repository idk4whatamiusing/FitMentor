// Package apperr mirrors the Rust AppError → HTTP mapping in error.rs:
// {"error":{"code":...,"message":...}} with fixed status codes.
package apperr

import (
	"encoding/json"
	"net/http"
)

type Kind int

const (
	NotFound Kind = iota
	Unauthorized
	Forbidden
	BadRequest
	Conflict
	RateLimited
	Internal
)

type Error struct {
	Kind    Kind
	Message string
}

func (e *Error) Error() string { return e.Message }

func New(kind Kind, msg string) *Error { return &Error{Kind: kind, Message: msg} }

func BadRequestf(msg string) *Error { return New(BadRequest, msg) }

// InternalErr mirrors Rust's transparent anyhow passthrough: the message is exposed.
func InternalErr(err error) *Error {
	msg := "internal"
	if err != nil {
		msg = err.Error()
	}
	return New(Internal, msg)
}
func UnauthorizedErr() *Error { return New(Unauthorized, "unauthorized") }
func NotFoundErr() *Error     { return New(NotFound, "not found") }
func ForbiddenErr() *Error    { return New(Forbidden, "forbidden") }
func RateLimitedErr() *Error  { return New(RateLimited, "rate limited") }

func statusAndCode(k Kind) (int, string) {
	switch k {
	case NotFound:
		return http.StatusNotFound, "not_found"
	case Unauthorized:
		return http.StatusUnauthorized, "unauthorized"
	case Forbidden:
		return http.StatusForbidden, "forbidden"
	case BadRequest:
		return http.StatusBadRequest, "bad_request"
	case Conflict:
		return http.StatusConflict, "conflict"
	case RateLimited:
		return http.StatusTooManyRequests, "rate_limited"
	default:
		return http.StatusInternalServerError, "internal"
	}
}

func Write(w http.ResponseWriter, err error) {
	ae, ok := err.(*Error)
	if !ok || ae == nil {
		ae = New(Internal, "internal")
	}
	status, code := statusAndCode(ae.Kind)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{"code": code, "message": ae.Message},
	})
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
