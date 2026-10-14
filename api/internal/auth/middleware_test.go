package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	firebaseauth "firebase.google.com/go/v4/auth"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

type fakeVerifier struct {
	tok *firebaseauth.Token
	err error

	called bool
}

func (f *fakeVerifier) VerifyIDTokenAndCheckRevoked(_ context.Context, _ string) (*firebaseauth.Token, error) {
	f.called = true
	return f.tok, f.err
}

func tokenFor(uid, role string) *firebaseauth.Token {
	return &firebaseauth.Token{UID: uid, Claims: map[string]any{"role": role}}
}

func reached(flag *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*flag = true
		w.WriteHeader(http.StatusOK)
	})
}

func errorCode(t *testing.T, body []byte) string {
	t.Helper()
	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("response is not the documented error envelope: %v (body %q)", err, body)
	}
	return env.Error.Code
}

func TestMiddlewareRejectsBadCredentials(t *testing.T) {
	cases := []struct {
		name     string
		header   string
		verifier *fakeVerifier
	}{
		{"no Authorization header", "", &fakeVerifier{tok: tokenFor("u", "driver")}},
		{"not a bearer scheme", "Basic abc123", &fakeVerifier{tok: tokenFor("u", "driver")}},
		{"bearer with no token", "Bearer   ", &fakeVerifier{tok: tokenFor("u", "driver")}},
		{"a revoked or disabled account", "Bearer abc", &fakeVerifier{err: errors.New("user has been disabled")}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var ran bool
			req := httptest.NewRequest(http.MethodGet, "/me", nil)
			if c.header != "" {
				req.Header.Set("Authorization", c.header)
			}
			rec := httptest.NewRecorder()

			Middleware(c.verifier)(reached(&ran)).ServeHTTP(rec, req)

			if ran {
				t.Fatal("the protected handler ran despite a rejected request")
			}
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
			if got := errorCode(t, rec.Body.Bytes()); got != string(domain.CodeUnauthenticated) {
				t.Fatalf("code = %q, want %q", got, domain.CodeUnauthenticated)
			}
		})
	}
}

func TestMiddlewareAttachesThePrincipal(t *testing.T) {
	v := &fakeVerifier{tok: tokenFor("driver-1", "driver")}

	var got Principal
	h := Middleware(v)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = MustPrincipal(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer abc")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if !v.called {
		t.Fatal("the token was never verified")
	}
	if got.UID != "driver-1" || got.Role != domain.RoleDriver {
		t.Fatalf("principal = %+v, want uid driver-1 role driver", got)
	}
}

// A user provisioned but not yet claimed reaches the middleware with no role.
func TestMiddlewareAllowsAMissingRoleThrough(t *testing.T) {
	v := &fakeVerifier{tok: &firebaseauth.Token{UID: "new-user", Claims: map[string]any{}}}

	var got Principal
	h := Middleware(v)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = MustPrincipal(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer abc")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if got.UID != "new-user" || got.Role != "" {
		t.Fatalf("principal = %+v, want uid new-user and an empty role", got)
	}
}

func TestRequireRole(t *testing.T) {
	adminArea := []domain.Role{domain.RoleAdmin, domain.RoleSuperadmin}
	driverOnly := []domain.Role{domain.RoleDriver}

	cases := []struct {
		name       string
		principal  *Principal
		want       []domain.Role
		wantStatus int
		wantCode   domain.Code
		wantRun    bool
	}{
		{"matching role passes", &Principal{UID: "u", Role: domain.RoleDriver}, driverOnly, http.StatusOK, "", true},
		{"a driver cannot reach admin routes", &Principal{UID: "u", Role: domain.RoleDriver}, adminArea, http.StatusForbidden, domain.CodeForbidden, false},
		{"an admin cannot reach driver routes", &Principal{UID: "u", Role: domain.RoleAdmin}, driverOnly, http.StatusForbidden, domain.CodeForbidden, false},
		{"no role at all is refused", &Principal{UID: "u"}, driverOnly, http.StatusForbidden, domain.CodeForbidden, false},
		{"no principal is unauthenticated", nil, driverOnly, http.StatusUnauthorized, domain.CodeUnauthenticated, false},

		{"an admin reaches the admin area", &Principal{UID: "u", Role: domain.RoleAdmin}, adminArea, http.StatusOK, "", true},
		{"a superadmin reaches the admin area", &Principal{UID: "u", Role: domain.RoleSuperadmin}, adminArea, http.StatusOK, "", true},
		{"a superadmin is not an implicit admin", &Principal{UID: "u", Role: domain.RoleSuperadmin}, []domain.Role{domain.RoleAdmin}, http.StatusForbidden, domain.CodeForbidden, false},
		{"a superadmin does not get driver routes", &Principal{UID: "u", Role: domain.RoleSuperadmin}, driverOnly, http.StatusForbidden, domain.CodeForbidden, false},
		{"an empty allow-list admits nobody", &Principal{UID: "u", Role: domain.RoleSuperadmin}, nil, http.StatusForbidden, domain.CodeForbidden, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var ran bool
			req := httptest.NewRequest(http.MethodGet, "/admin/shops", nil)
			if c.principal != nil {
				req = req.WithContext(WithPrincipal(req.Context(), *c.principal))
			}
			rec := httptest.NewRecorder()

			RequireRole(c.want...)(reached(&ran)).ServeHTTP(rec, req)

			if ran != c.wantRun {
				t.Fatalf("handler ran = %v, want %v", ran, c.wantRun)
			}
			if rec.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, c.wantStatus)
			}
			if c.wantCode != "" {
				if got := errorCode(t, rec.Body.Bytes()); got != string(c.wantCode) {
					t.Fatalf("code = %q, want %q", got, c.wantCode)
				}
			}
		})
	}
}
