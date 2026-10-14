package httpx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
}

func get(h http.Handler, addr string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/me", nil)
	r.RemoteAddr = addr
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestRateLimitAllowsTrafficUnderTheBudget(t *testing.T) {
	h := RateLimit(NewLimiter(600), ClientIPKey)(okHandler())

	for i := 0; i < 10; i++ {
		if rec := get(h, "1.2.3.4:1111"); rec.Code != http.StatusOK {
			t.Fatalf("request %d = %d, want 200", i, rec.Code)
		}
	}
}

func TestRateLimitRejectsOverTheBudget(t *testing.T) {
	h := RateLimit(NewLimiter(2), ClientIPKey)(okHandler())

	var limited *httptest.ResponseRecorder
	for i := 0; i < 40; i++ {
		rec := get(h, "1.2.3.4:1111")
		if rec.Code == http.StatusTooManyRequests {
			limited = rec
			break
		}
	}
	if limited == nil {
		t.Fatal("40 requests against a 2/min budget were all allowed")
	}

	if got := errCodeOf(t, limited); got != string(domain.CodeRateLimited) {
		t.Fatalf("code = %q, want RATE_LIMITED", got)
	}

	if got := limited.Header().Get("Retry-After"); got == "" {
		t.Fatal("no Retry-After on a 429")
	} else if n, err := strconv.Atoi(got); err != nil || n < 1 {
		t.Fatalf("Retry-After = %q; must be a whole number of seconds, at least 1", got)
	}
	for _, hdr := range []string{"RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"} {
		if limited.Header().Get(hdr) == "" {
			t.Errorf("missing %s", hdr)
		}
	}
	if got := limited.Header().Get("RateLimit-Remaining"); got != "0" {
		t.Errorf("RateLimit-Remaining = %q on a rejection, want 0", got)
	}
}

// One noisy client must not throttle everyone else.
func TestRateLimitIsPerKey(t *testing.T) {
	h := RateLimit(NewLimiter(2), ClientIPKey)(okHandler())

	for i := 0; i < 40; i++ {
		get(h, "1.1.1.1:1111")
	}
	if rec := get(h, "1.1.1.1:1111"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the noisy client was not limited: %d", rec.Code)
	}
	if rec := get(h, "2.2.2.2:2222"); rec.Code != http.StatusOK {
		t.Fatalf("an unrelated client got %d; limits must not be shared", rec.Code)
	}
}

// An empty key exempts the request.
func TestRateLimitExemptsAnEmptyKey(t *testing.T) {
	h := RateLimit(NewLimiter(1), func(*http.Request) string { return "" })(okHandler())
	for i := 0; i < 50; i++ {
		if rec := get(h, "1.2.3.4:1111"); rec.Code != http.StatusOK {
			t.Fatalf("an exempt request was limited: %d", rec.Code)
		}
	}
}

// The bounding is the whole point: a limiter keyed on client IP that never forgets is an allocation per distinct address, which is the exhaustion it exists to prevent.
func TestLimiterEvictsIdleKeys(t *testing.T) {
	l := NewLimiter(60)
	clock := time.Now()
	l.now = func() time.Time { return clock }

	for i := 0; i < 100; i++ {
		l.allow(fmt.Sprintf("ip-%d", i))
	}
	if l.Len() != 100 {
		t.Fatalf("tracking %d keys, want 100", l.Len())
	}

	clock = clock.Add(11 * time.Minute)
	l.allow("fresh")

	if l.Len() != 1 {
		t.Fatalf("after the idle window %d keys remain, want only the fresh one", l.Len())
	}
}

func TestLimiterIsHardCapped(t *testing.T) {
	l := NewLimiter(60)
	l.max = 50

	for i := 0; i < 500; i++ {
		l.allow(fmt.Sprintf("ip-%d", i))
	}
	if l.Len() > l.max {
		t.Fatalf("tracking %d keys with a cap of %d", l.Len(), l.max)
	}
}

// Cloud Run shares one handler across up to 80 concurrent requests, so the limiter's map is contended by definition.
func TestLimiterIsSafeUnderConcurrency(t *testing.T) {
	h := RateLimit(NewLimiter(6000), ClientIPKey)(okHandler())

	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				get(h, fmt.Sprintf("10.0.0.%d:1111", i%8))
			}
		}(i)
	}
	wg.Wait()
}

func errCodeOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var env errorEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("429 body is not the error envelope: %v (%q)", err, rec.Body.String())
	}
	return string(env.Error.Code)
}
