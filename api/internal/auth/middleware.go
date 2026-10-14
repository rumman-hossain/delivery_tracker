package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"

	firebaseauth "firebase.google.com/go/v4/auth"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

// TokenVerifier is the slice of the Firebase auth client the middleware needs.
type TokenVerifier interface {
	VerifyIDTokenAndCheckRevoked(ctx context.Context, idToken string) (*firebaseauth.Token, error)
}

// Principal is the authenticated caller.
type Principal struct {
	UID  string
	Role domain.Role
}

type ctxKey int

const principalKey ctxKey = iota

// Middleware verifies the bearer token and attaches the Principal to the context.
func Middleware(v TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, err := bearerToken(r)
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}
			tok, verifyErr := v.VerifyIDTokenAndCheckRevoked(r.Context(), raw)
			if verifyErr != nil {
				httpx.WriteError(w, r, domain.Unauthenticated("your session is not valid; sign in again"))
				return
			}

			role, _ := tok.Claims["role"].(string)
			p := Principal{UID: tok.UID, Role: domain.Role(role)}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey, p)))
		})
	}
}

// RequireRole rejects a caller whose claim is not one of the given roles.
func RequireRole(want ...domain.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := PrincipalFrom(r.Context())
			if !ok {
				httpx.WriteError(w, r, domain.Unauthenticated("you are not signed in"))
				return
			}
			if !slices.Contains(want, p.Role) {
				httpx.WriteError(w, r, domain.Forbidden("your account does not have access to this area"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// PrincipalFrom returns the caller attached by Middleware.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey).(Principal)
	return p, ok
}

// MustPrincipal is for handlers mounted behind Middleware, where absence is a bug.
func MustPrincipal(ctx context.Context) Principal {
	p, _ := PrincipalFrom(ctx)
	return p
}

// WithPrincipal injects a caller directly.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

func bearerToken(r *http.Request) (string, *domain.AppError) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", domain.Unauthenticated("you are not signed in")
	}
	scheme, token, found := strings.Cut(h, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
		return "", domain.Unauthenticated("the Authorization header must be a bearer token")
	}
	return strings.TrimSpace(token), nil
}
