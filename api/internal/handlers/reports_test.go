package handlers

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// The report makes one ListEvents call per trip in range, so an unbounded span is an unbounded fan-out of Firestore reads.
func TestReportCSVBoundsTheSpan(t *testing.T) {
	cases := []struct {
		name string
		from string
		to   string
		want int
	}{
		{"a single day", "2026-09-22", "2026-09-22", http.StatusOK},
		{"a month", "2026-09-01", "2026-09-30", http.StatusOK},
		{"a quarter", "2026-07-01", "2026-09-30", http.StatusOK},
		{"half a year", "2026-01-01", "2026-06-30", http.StatusBadRequest},
		{"a century", "1970-01-01", "2070-01-01", http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := call(newAPI(&fakeStore{}, nil, nil).ReportCSV, http.MethodGet,
				"/admin/reports/trips.csv?from="+c.from+"&to="+c.to, "", &adminPrincipal)
			requireStatus(t, rec, c.want)
		})
	}
}

func TestReportCSV(t *testing.T) {
	t.Run("the date range goes to the query, not a full scan", func(t *testing.T) {
		fs := &fakeStore{}
		rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		if fs.rangeFrom != "2026-09-01" || fs.rangeTo != "2026-09-30" {
			t.Fatalf("range = %q..%q", fs.rangeFrom, fs.rangeTo)
		}
	})

	t.Run("a mid-report failure is an error, not a truncated 200", func(t *testing.T) {
		fs := &fakeStore{
			rangeTrips: []domain.Trip{{ID: "t1", AssignedDate: "2026-09-10"}},
			eventsErr:  errors.New("firestore unavailable"),
		}
		rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30", "", &adminPrincipal)

		if rec.Code == http.StatusOK {
			t.Fatalf("status = 200 with body %q; a failed report must not look successful", rec.Body.String())
		}
		if strings.Contains(rec.Header().Get("Content-Type"), "csv") {
			t.Fatal("a failed report must not be served as a CSV download")
		}
		errCode(t, rec)
	})

	t.Run("an optional driver filter narrows the report", func(t *testing.T) {
		fs := &fakeStore{
			rangeTrips: []domain.Trip{
				{ID: "t1", DriverUID: "alice", AssignedDate: "2026-09-10"},
				{ID: "t2", DriverUID: "bob", AssignedDate: "2026-09-11"},
				{ID: "t3", DriverUID: "alice", AssignedDate: "2026-09-12"},
			},
			events: []domain.Event{{ID: "ev1", Type: domain.EventStart}},
		}
		rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30&driver=alice", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		body := rec.Body.String()
		if strings.Contains(body, "t2") {
			t.Fatalf("bob's trip leaked into alice's report:\n%s", body)
		}
		for _, id := range []string{"t1", "t3"} {
			if !strings.Contains(body, id) {
				t.Fatalf("alice's trip %s is missing from her report:\n%s", id, body)
			}
		}
		if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "alice") {
			t.Fatalf("Content-Disposition = %q, want the driver in the filename", cd)
		}
	})

	t.Run("no driver filter keeps every driver", func(t *testing.T) {
		fs := &fakeStore{
			rangeTrips: []domain.Trip{
				{ID: "t1", DriverUID: "alice", AssignedDate: "2026-09-10"},
				{ID: "t2", DriverUID: "bob", AssignedDate: "2026-09-11"},
			},
			events: []domain.Event{{ID: "ev1", Type: domain.EventStart}},
		}
		rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		body := rec.Body.String()
		for _, id := range []string{"t1", "t2"} {
			if !strings.Contains(body, id) {
				t.Fatalf("trip %s is missing from the fleet-wide report:\n%s", id, body)
			}
		}
	})

	t.Run("an unknown driver is an empty report, not an error", func(t *testing.T) {
		fs := &fakeStore{
			rangeTrips: []domain.Trip{
				{ID: "t1", DriverUID: "alice", AssignedDate: "2026-09-10"},
			},
			events: []domain.Event{{ID: "ev1", Type: domain.EventStart}},
		}
		rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
			"/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30&driver=nobody", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		if strings.Contains(rec.Body.String(), "t1") {
			t.Fatal("a report for an unknown driver must not contain anyone's trips")
		}
	})

	cases := []string{
		"?to=2026-09-30",
		"?from=2026-09-01",
		"?from=nonsense&to=2026-09-30",
		"?from=2026-09-30&to=2026-09-01",
	}
	for _, q := range cases {
		t.Run("bad range "+q, func(t *testing.T) {
			rec := call(newAPI(nil, nil, nil).ReportCSV, http.MethodGet, "/admin/reports/trips.csv"+q, "", &adminPrincipal)
			requireStatus(t, rec, http.StatusBadRequest)
		})
	}
}

func TestReportFilenameCannotBeSteered(t *testing.T) {
	fs := &fakeStore{
		rangeTrips: []domain.Trip{{ID: "t1", DriverUID: "alice", AssignedDate: "2026-09-10"}},
		events:     []domain.Event{{ID: "ev1", Type: domain.EventStart}},
	}
	rec := call(newAPI(fs, nil, nil).ReportCSV, http.MethodGet,
		`/admin/reports/trips.csv?from=2026-09-01&to=2026-09-30&driver=x";filename="invoice.html`,
		"", &adminPrincipal)

	requireStatus(t, rec, http.StatusOK)
	cd := rec.Header().Get("Content-Disposition")
	if strings.Contains(cd, "invoice.html") || strings.Contains(cd, ";filename=") {
		t.Fatalf("Content-Disposition = %q, want the injected filename stripped", cd)
	}
	if !strings.HasPrefix(cd, `attachment; filename="`) || !strings.HasSuffix(cd, `.csv"`) {
		t.Fatalf("Content-Disposition = %q, want a single quoted .csv filename", cd)
	}
}
