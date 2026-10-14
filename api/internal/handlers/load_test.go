package handlers

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

func BenchmarkReached(b *testing.B) {
	fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2}}
	a := newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}})

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rec := callIdem(a.Reached, http.MethodPost, "/me/trips/t1/reached", validReached,
			&driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		if rec.Code != http.StatusCreated {
			b.Fatalf("status = %d", rec.Code)
		}
	}
}

func BenchmarkListTrips(b *testing.B) {
	trips := make([]domain.Trip, 500)
	for i := range trips {
		trips[i] = domain.Trip{ID: fmt.Sprintf("t%d", i), AssignedDate: "2026-09-22", Status: domain.TripCompleted}
	}
	a := newAPI(&fakeStore{listTrips: trips}, nil, nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if rec := call(a.ListTrips, http.MethodGet, "/admin/trips", "", &adminPrincipal); rec.Code != http.StatusOK {
			b.Fatalf("status = %d", rec.Code)
		}
	}
}

func benchmarkReportCSV(b *testing.B, tripCount int) {
	trips := make([]domain.Trip, tripCount)
	for i := range trips {
		trips[i] = domain.Trip{ID: fmt.Sprintf("t%d", i), AssignedDate: "2026-09-10"}
	}
	seq := 1
	events := []domain.Event{
		{Type: domain.EventStart, ServerTime: time.Now()},
		{Type: domain.EventReached, ServerTime: time.Now(), Seq: &seq},
		{Type: domain.EventComplete, ServerTime: time.Now()},
	}
	a := newAPI(&fakeStore{rangeTrips: trips, events: events}, nil, nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rec := call(a.ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30", "", &adminPrincipal)
		if rec.Code != http.StatusOK {
			b.Fatalf("status = %d", rec.Code)
		}
	}
}

func BenchmarkReportCSV10Trips(b *testing.B)   { benchmarkReportCSV(b, 10) }
func BenchmarkReportCSV100Trips(b *testing.B)  { benchmarkReportCSV(b, 100) }
func BenchmarkReportCSV1000Trips(b *testing.B) { benchmarkReportCSV(b, 1000) }

// The report reads one event list per trip.
func TestReportCSVReadsEventsOncePerTrip(t *testing.T) {
	trips := make([]domain.Trip, 25)
	for i := range trips {
		trips[i] = domain.Trip{ID: fmt.Sprintf("t%d", i), AssignedDate: "2026-09-10"}
	}
	fs := &fakeStore{rangeTrips: trips}
	rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
		"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30", "", &adminPrincipal)

	requireStatus(t, rec, http.StatusOK)
	if fs.eventsCalls != len(trips) {
		t.Fatalf("ListEvents called %d times for %d trips", fs.eventsCalls, len(trips))
	}
}

// Cloud Run serves up to 80 concurrent requests per instance on one handler value, so the handlers must be safe to share.
func TestHandlersAreSafeUnderConcurrency(t *testing.T) {
	a := newAPI(
		&fakeStore{
			getTrip:   inProgressTrip(),
			reached:   &domain.ReachedResponse{NextSeq: 2},
			listTrips: []domain.Trip{{ID: "t1"}},
			getUser:   domain.User{Role: domain.RoleDriver, Name: "Sato"},
		},
		nil,
		&fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20}, uploadURL: "https://signed"},
	)

	const workers = 64
	var wg sync.WaitGroup
	wg.Add(workers)

	for i := 0; i < workers; i++ {
		go func(i int) {
			defer wg.Done()
			switch i % 4 {
			case 0:
				callIdem(a.Reached, http.MethodPost, "/me/trips/t1/reached", validReached,
					&driverPrincipal, map[string]string{"id": "t1"}, fmt.Sprintf("key-%d", i))
			case 1:
				call(a.ListTrips, http.MethodGet, "/admin/trips", "", &adminPrincipal)
			case 2:
				call(a.Me, http.MethodGet, "/me", "", &driverPrincipal)
			case 3:
				callP(a.NextStop, http.MethodGet, "/me/trips/t1/next", "",
					&driverPrincipal, map[string]string{"id": "t1"})
			}
		}(i)
	}
	wg.Wait()
}
