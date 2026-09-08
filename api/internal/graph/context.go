package graph

import (
	"context"

	"fitmentor/api/internal/auth"
)

type userCtxKey struct{}

// ContextWithUser attaches the authenticated user for requireUser.
func ContextWithUser(ctx context.Context, u *auth.AuthUser) context.Context {
	return context.WithValue(ctx, userCtxKey{}, u)
}

func userFromCtx(ctx context.Context) *auth.AuthUser {
	u, _ := ctx.Value(userCtxKey{}).(*auth.AuthUser)
	return u
}
