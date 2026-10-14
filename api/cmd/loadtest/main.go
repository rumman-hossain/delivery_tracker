package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type result struct {
	endpoint string
	status   int
	latency  time.Duration
	err      error
}

func main() {
	var (
		baseURL     = flag.String("base-url", "", "deployed API base URL, e.g. https://your-api.a.run.app")
		token       = flag.String("token", "", "Firebase ID token for an authenticated user")
		concurrency = flag.Int("concurrency", 10, "number of concurrent workers")
		duration    = flag.Duration("duration", 30*time.Second, "how long to sustain load")
		timeout     = flag.Duration("timeout", 10*time.Second, "per-request timeout")
	)
	flag.Parse()

	if *baseURL == "" || *token == "" {
		log.Fatal("both -base-url and -token are required")
	}
	*baseURL = strings.TrimRight(*baseURL, "/")

	endpoints := []string{
		"/health",
		"/me",
		"/me/trips",
		"/admin/trips",
		"/admin/shops",
		"/admin/routes",
		"/admin/users",
		"/admin/config",
	}

	pool := *concurrency * 2
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = pool
	transport.MaxIdleConnsPerHost = pool
	transport.IdleConnTimeout = 90 * time.Second

	client := &http.Client{Timeout: *timeout, Transport: transport}
	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	results := make(chan result, 4096)
	var issued atomic.Int64

	var wg sync.WaitGroup
	for w := 0; w < *concurrency; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			consecutiveErrors := 0
			for i := 0; ctx.Err() == nil; i++ {
				ep := endpoints[(w+i)%len(endpoints)]
				issued.Add(1)
				r := hit(ctx, client, *baseURL, ep, *token)
				results <- r

				if r.err != nil {
					consecutiveErrors++
					if consecutiveErrors > 3 {
						select {
						case <-ctx.Done():
						case <-time.After(250 * time.Millisecond):
						}
					}
					continue
				}
				consecutiveErrors = 0
			}
		}(w)
	}

	go func() { wg.Wait(); close(results) }()

	started := time.Now()
	collected := collect(results)
	elapsed := time.Since(started)

	report(collected, elapsed, *concurrency, issued.Load())
}

func hit(ctx context.Context, c *http.Client, base, endpoint, token string) result {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+endpoint, nil)
	if err != nil {
		return result{endpoint: endpoint, err: err}
	}
	if endpoint != "/health" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	start := time.Now()
	resp, err := c.Do(req)
	latency := time.Since(start)
	if err != nil {
		if ctx.Err() != nil {
			return result{endpoint: endpoint, latency: latency, status: -1}
		}
		return result{endpoint: endpoint, latency: latency, err: err}
	}
	defer resp.Body.Close()

	return result{endpoint: endpoint, status: resp.StatusCode, latency: latency}
}

const maxSamplesPerEndpoint = 50_000

type tally struct {
	ok       int
	rejected int
	failed   int
	latency  []time.Duration
}

func collect(in <-chan result) map[string]*tally {
	out := map[string]*tally{}
	for r := range in {
		if r.status == -1 {
			continue
		}
		t := out[r.endpoint]
		if t == nil {
			t = &tally{}
			out[r.endpoint] = t
		}
		switch {
		case r.err != nil || r.status >= 500:
			t.failed++
		case r.status >= 200 && r.status < 300:
			t.ok++
		default:
			t.rejected++
		}
		if r.err == nil && len(t.latency) < maxSamplesPerEndpoint {
			t.latency = append(t.latency, r.latency)
		}
	}
	return out
}

func report(byEndpoint map[string]*tally, elapsed time.Duration, concurrency int, issued int64) {
	fmt.Printf("\nsustained %s at concurrency %d\n", elapsed.Round(time.Millisecond), concurrency)
	fmt.Printf("%d requests issued\n\n", issued)
	fmt.Printf("%-18s %7s %9s %7s %10s %10s %10s %10s\n",
		"endpoint", "ok", "rejected", "failed", "p50", "p95", "p99", "max")

	names := make([]string, 0, len(byEndpoint))
	for k := range byEndpoint {
		names = append(names, k)
	}
	sort.Strings(names)

	var totalOK, totalRejected, totalFailed int
	for _, name := range names {
		t := byEndpoint[name]
		totalOK += t.ok
		totalRejected += t.rejected
		totalFailed += t.failed

		if len(t.latency) == 0 {
			fmt.Printf("%-18s %7d %9d %7d %10s %10s %10s %10s\n",
				name, t.ok, t.rejected, t.failed, "-", "-", "-", "-")
			continue
		}
		lat := t.latency
		sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
		fmt.Printf("%-18s %7d %9d %7d %10s %10s %10s %10s\n",
			name, t.ok, t.rejected, t.failed,
			pct(lat, 0.50), pct(lat, 0.95), pct(lat, 0.99), lat[len(lat)-1].Round(time.Millisecond))
	}

	total := totalOK + totalRejected + totalFailed
	rps := float64(total) / elapsed.Seconds()
	fmt.Printf("\n%d samples, %.0f req/s - %d ok, %d rejected, %d failed\n",
		total, rps, totalOK, totalRejected, totalFailed)

	switch {
	case total == 0:
		fmt.Fprintln(os.Stderr, "\nno samples at all: nothing reached the target. Check -base-url and that the service is reachable.")
		os.Exit(1)
	case totalFailed > 0:
		fmt.Fprintf(os.Stderr, "\n%d requests failed outright: check Cloud Run logs before trusting these percentiles\n", totalFailed)
		os.Exit(1)
	case totalOK == 0:
		fmt.Fprintln(os.Stderr, "\nnothing was measured: every request was rejected. Check the token is valid and not expired.")
		os.Exit(1)
	case totalRejected > totalOK:
		fmt.Fprintf(os.Stderr, "\n%d of %d requests were rejected (401/403), more than succeeded. These percentiles mostly measure the auth middleware, not the handlers -- use a token whose role matches the endpoints you care about.\n", totalRejected, total)
		os.Exit(1)
	}
}

func pct(sorted []time.Duration, p float64) string {
	i := int(float64(len(sorted)-1) * p)
	return sorted[i].Round(time.Millisecond).String()
}
