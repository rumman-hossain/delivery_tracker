package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestID(t *testing.T) {
	t.Run("assigns one when the client sends none", func(t *testing.T) {
		var seen string
		h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seen = RequestIDFrom(r.Context())
		}))

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

		if seen == "" {
			t.Fatal("no request id reached the handler")
		}
		if got := rec.Header().Get(RequestIDHeader); got != seen {
			t.Fatalf("header = %q, handler saw %q", got, seen)
		}
	})

	t.Run("honours one supplied upstream", func(t *testing.T) {
		var seen string
		h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seen = RequestIDFrom(r.Context())
		}))

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set(RequestIDHeader, "upstream-123")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if seen != "upstream-123" {
			t.Fatalf("handler saw %q, want the upstream id", seen)
		}
		if got := rec.Header().Get(RequestIDHeader); got != "upstream-123" {
			t.Fatalf("header = %q", got)
		}
	})

	t.Run("two requests get different ids", func(t *testing.T) {
		ids := map[string]bool{}
		h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ids[RequestIDFrom(r.Context())] = true
		}))
		for i := 0; i < 2; i++ {
			h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
		}
		if len(ids) != 2 {
			t.Fatalf("got %d distinct ids across 2 requests", len(ids))
		}
	})

	t.Run("outside a request there is no id", func(t *testing.T) {
		if got := RequestIDFrom(httptest.NewRequest(http.MethodGet, "/", nil).Context()); got != "" {
			t.Fatalf("RequestIDFrom = %q, want empty", got)
		}
	})
}
