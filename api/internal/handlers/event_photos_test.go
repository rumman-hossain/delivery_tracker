package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

func TestGetEventPhotoServesTheBytes(t *testing.T) {
	fs := &fakeStore{
		getTrip: domain.Trip{ID: "t1", DriverUID: "d1"},
		events:  []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg", PhotoGeneration: 17}},
	}
	ph := &fakePhotos{body: "\xff\xd8\xff-jpeg-bytes"}

	rec := callP(newAPI(fs, nil, ph).GetEventPhoto, http.MethodGet,
		"/admin/trips/t1/events/e1/photo", "", &adminPrincipal,
		map[string]string{"id": "t1", "eventId": "e1"})

	requireStatus(t, rec, http.StatusOK)
	if got := rec.Body.String(); got != ph.body {
		t.Fatalf("body = %q, want the object's bytes", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != media.PhotoContentType {
		t.Fatalf("Content-Type = %q, want %q", ct, media.PhotoContentType)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "private") {
		t.Fatalf("Cache-Control = %q, want it private", cc)
	}
	if v := rec.Header().Values("Vary"); !slices.Contains(v, "Authorization") {
		t.Fatalf("Vary = %q, want it to name Authorization", v)
	}
	if ph.openedGen != 17 {
		t.Fatalf("read generation %d, want the event's 17", ph.openedGen)
	}
	if ph.opened != "trips/t1/1.jpg" {
		t.Fatalf("read %q, want the event's object", ph.opened)
	}
}

// An event recorded before generations were stored has none, and must still be readable.
func TestGetEventPhotoWithoutAGenerationReadsWhatIsThere(t *testing.T) {
	fs := &fakeStore{
		getTrip: domain.Trip{ID: "t1", DriverUID: "d1"},
		events:  []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg"}},
	}
	ph := &fakePhotos{body: "bytes"}

	rec := callP(newAPI(fs, nil, ph).GetEventPhoto, http.MethodGet,
		"/admin/trips/t1/events/e1/photo", "", &adminPrincipal,
		map[string]string{"id": "t1", "eventId": "e1"})

	requireStatus(t, rec, http.StatusOK)
	if ph.openedGen != 0 {
		t.Fatalf("read generation %d, want 0 for an event that stored none", ph.openedGen)
	}
}

func TestGetEventPhotoRefusals(t *testing.T) {
	trip := domain.Trip{ID: "t1", DriverUID: "d1"}

	cases := []struct {
		name  string
		store *fakeStore
		ph    *fakePhotos
		event string
		want  int
	}{
		{
			"a trip that is not there",
			&fakeStore{getTripErr: domain.NotFound("that trip")}, &fakePhotos{}, "e1",
			http.StatusNotFound,
		},
		{
			"an event that is not there",
			&fakeStore{getTrip: trip}, &fakePhotos{}, "nope",
			http.StatusNotFound,
		},
		{
			"an event that never had a photo",
			&fakeStore{getTrip: trip, events: []domain.Event{{ID: "e1", Type: domain.EventStart}}},
			&fakePhotos{}, "e1", http.StatusNotFound,
		},
		{
			"an object that has gone missing",
			&fakeStore{getTrip: trip, events: []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg"}}},
			&fakePhotos{openErr: media.ErrObjectMissing}, "e1", http.StatusNotFound,
		},
		{
			"storage that could not be reached",
			&fakeStore{getTrip: trip, events: []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg"}}},
			&fakePhotos{openErr: errors.New("storage unavailable")}, "e1", http.StatusInternalServerError,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := callP(newAPI(c.store, nil, c.ph).GetEventPhoto, http.MethodGet,
				"/admin/trips/t1/events/"+c.event+"/photo", "", &adminPrincipal,
				map[string]string{"id": "t1", "eventId": c.event})
			requireStatus(t, rec, c.want)
		})
	}
}

// The read hands back a path the client must call with its own token, never a URL that works for whoever holds it.
func TestGetTripAdvertisesTheApiPathForPhotos(t *testing.T) {
	fs := &fakeStore{
		getTrip: domain.Trip{ID: "t1", DriverUID: "d1"},
		events: []domain.Event{
			{ID: "e1", PhotoPath: "trips/t1/1.jpg"},
			{ID: "e2", Type: domain.EventStart},
		},
	}

	rec := callP(newAPI(fs, nil, &fakePhotos{}).GetTrip, http.MethodGet, "/admin/trips/t1", "",
		&adminPrincipal, map[string]string{"id": "t1"})

	requireStatus(t, rec, http.StatusOK)
	var got struct {
		Photos map[string]string `json:"photos"`
	}
	decode(t, rec, &got)

	if want := "/admin/trips/t1/events/e1/photo"; got.Photos["e1"] != want {
		t.Fatalf("photos[e1] = %q, want %q", got.Photos["e1"], want)
	}
	if _, ok := got.Photos["e2"]; ok {
		t.Fatal("an event with no photo must not be offered one")
	}
	if strings.Contains(rec.Body.String(), "storage.googleapis.com") {
		t.Fatal("a signed storage url reached the client")
	}
}

// The bucket's own metadata is not a content type the API will repeat.
func TestGetEventPhotoServesItsOwnContentType(t *testing.T) {
	fs := &fakeStore{
		getTrip: domain.Trip{ID: "t1", DriverUID: "d1"},
		events:  []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg"}},
	}
	ph := &fakePhotos{body: "<script>alert(1)</script>"}

	rec := callP(newAPI(fs, nil, ph).GetEventPhoto, http.MethodGet,
		"/admin/trips/t1/events/e1/photo", "", &adminPrincipal,
		map[string]string{"id": "t1", "eventId": "e1"})

	requireStatus(t, rec, http.StatusOK)
	if ct := rec.Header().Get("Content-Type"); ct != media.PhotoContentType {
		t.Fatalf("Content-Type = %q, want %q whatever the object claims", ct, media.PhotoContentType)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("a response the browser may sniff is one it may run")
	}
}

// Vary is added, not set.
func TestGetEventPhotoKeepsTheVaryHeadersItWasGiven(t *testing.T) {
	fs := &fakeStore{
		getTrip: domain.Trip{ID: "t1", DriverUID: "d1"},
		events:  []domain.Event{{ID: "e1", PhotoPath: "trips/t1/1.jpg"}},
	}

	rec := httptest.NewRecorder()
	rec.Header().Add("Vary", "Origin")
	r := httptest.NewRequest(http.MethodGet, "/admin/trips/t1/events/e1/photo", nil)
	r = r.WithContext(auth.WithPrincipal(r.Context(), adminPrincipal))
	rc := chi.NewRouteContext()
	rc.URLParams.Add("id", "t1")
	rc.URLParams.Add("eventId", "e1")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))

	newAPI(fs, nil, &fakePhotos{body: "jpeg"}).GetEventPhoto(rec, r)

	requireStatus(t, rec, http.StatusOK)
	got := rec.Header().Values("Vary")
	if !slices.Contains(got, "Origin") {
		t.Fatalf("Vary = %q, want the middleware's Origin to survive", got)
	}
	if !slices.Contains(got, "Authorization") {
		t.Fatalf("Vary = %q, want Authorization as well", got)
	}
}
