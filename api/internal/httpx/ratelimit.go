package httpx

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// KeyFunc extracts the value a request is limited against.
type KeyFunc func(*http.Request) string

// Limiter is a token bucket per key, with bounded memory.
type Limiter struct {
	limit rate.Limit
	burst int
	ttl   time.Duration
	max   int

	mu      sync.Mutex
	entries map[string]*entry

	now func() time.Time
}

type entry struct {
	lim  *rate.Limiter
	seen time.Time
}

// NewLimiter builds a limiter allowing perMinute requests per key, with a burst allowance of half a minute's worth (at least 10) so a driver tapping through several stops in quick succession is never throttled.
func NewLimiter(perMinute int) *Limiter {
	burst := perMinute / 2
	if burst < 10 {
		burst = 10
	}
	return &Limiter{
		limit:   rate.Limit(float64(perMinute) / 60.0),
		burst:   burst,
		ttl:     10 * time.Minute,
		max:     10_000,
		entries: make(map[string]*entry),
		now:     time.Now,
	}
}

func (l *Limiter) allow(key string) (bool, time.Duration, float64) {
	l.mu.Lock()
	e, ok := l.entries[key]
	if !ok {
		l.sweepLocked()
		e = &entry{lim: rate.NewLimiter(l.limit, l.burst)}
		l.entries[key] = e
	}
	e.seen = l.now()
	lim := e.lim
	l.mu.Unlock()

	if lim.Allow() {
		return true, 0, lim.Tokens()
	}
	res := lim.Reserve()
	wait := res.Delay()
	res.Cancel()
	return false, wait, 0
}

func (l *Limiter) sweepLocked() {
	if len(l.entries) < l.max {
		cutoff := l.now().Add(-l.ttl)
		for k, e := range l.entries {
			if e.seen.Before(cutoff) {
				delete(l.entries, k)
			}
		}
		return
	}
	for len(l.entries) >= l.max {
		var oldestKey string
		var oldest time.Time
		for k, e := range l.entries {
			if oldestKey == "" || e.seen.Before(oldest) {
				oldestKey, oldest = k, e.seen
			}
		}
		delete(l.entries, oldestKey)
	}
}

// Len reports how many keys are being tracked.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// RateLimit rejects a caller over its budget with 429 and the standard headers.
func RateLimit(l *Limiter, key KeyFunc) func(http.Handler) http.Handler {
	perMinute := strconv.Itoa(int(float64(l.limit) * 60))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			k := key(r)
			if k == "" {
				next.ServeHTTP(w, r)
				return
			}

			ok, wait, remaining := l.allow(k)
			w.Header().Set("RateLimit-Limit", perMinute)

			if !ok {
				retry := int(wait.Seconds() + 0.999)
				if retry < 1 {
					retry = 1
				}
				w.Header().Set("RateLimit-Remaining", "0")
				w.Header().Set("RateLimit-Reset", strconv.Itoa(retry))
				w.Header().Set("Retry-After", strconv.Itoa(retry))
				WriteError(w, r, domain.RateLimited("too many requests; slow down and try again shortly"))
				return
			}

			w.Header().Set("RateLimit-Remaining", strconv.Itoa(int(remaining)))
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIPKey limits by source address, for requests that have not authenticated yet.
func ClientIPKey(r *http.Request) string {
	if ip := r.RemoteAddr; ip != "" {
		return ip
	}
	return "unknown"
}
