package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

func inProgressTrip() domain.Trip {
	return domain.Trip{
		ID:             "t1",
		DriverUID:      driverPrincipal.UID,
		Status:         domain.TripInProgress,
		CurrentStopSeq: 1,
		RouteSnapshot: domain.RouteSnapshot{Stops: []domain.SnapshotStop{
			{Seq: 1, Type: domain.StopShop, ShopName: "Shop A",
				ExpectedLat: fp(35.6839), ExpectedLng: fp(139.7744), ExpectedRadiusM: fp(50)},
			{Seq: 2, Type: domain.StopHome, Label: "Tanaka residence"},
		}},
	}
}

const validReached = `{"seq":1,"lat":35.6839,"lng":139.7744,"accuracyM":12.4,` +
	`"clientTime":"2026-09-21T10:41:07.123Z","deliveryStatus":"delivered","photoPath":"trips/t1/1.jpg"}`

// A driver must never be able to act on a trip that is not theirs.
func TestOwnTripRefusesAnotherDriversTrip(t *testing.T) {
	someoneElses := inProgressTrip()
	someoneElses.DriverUID = "another-driver"

	t.Run("next", func(t *testing.T) {
		fs := &fakeStore{getTrip: someoneElses}
		rec := callP(newAPI(fs, nil, nil).NextStop, http.MethodGet, "/me/trips/t1/next", "",
			&driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusForbidden)
	})

	t.Run("photo-url", func(t *testing.T) {
		fs := &fakeStore{getTrip: someoneElses}
		rec := callP(newAPI(fs, nil, nil).PhotoURL, http.MethodPost, "/me/trips/t1/photo-url",
			`{"seq":1,"contentType":"image/jpeg"}`, &driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusForbidden)
	})

	t.Run("reached", func(t *testing.T) {
		fs := &fakeStore{getTrip: someoneElses}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusForbidden)
	})
}

// start and complete must hand the store the token's uid.
func TestStartAndCompletePassThePrincipalsUID(t *testing.T) {
	trip := inProgressTrip()
	trip.DriverUID = "another-driver"

	t.Run("start", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip}
		callP(newAPI(fs, nil, nil).StartTrip, http.MethodPost, "/me/trips/t1/start",
			`{"clientTime":"2026-09-21T10:41:07.123Z"}`, &driverPrincipal, map[string]string{"id": "t1"})
		if fs.startUID != driverPrincipal.UID {
			t.Fatalf("store received uid %q, want the principal's %q", fs.startUID, driverPrincipal.UID)
		}
	})

	t.Run("complete", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip}
		callP(newAPI(fs, nil, nil).CompleteTrip, http.MethodPost, "/me/trips/t1/complete",
			`{"clientTime":"2026-09-21T10:41:07.123Z"}`, &driverPrincipal, map[string]string{"id": "t1"})
		if fs.completeUID != driverPrincipal.UID {
			t.Fatalf("store received uid %q, want the principal's %q", fs.completeUID, driverPrincipal.UID)
		}
	})

	t.Run("the store's forbidden reaches the client", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, startErr: domain.Forbidden("that trip belongs to another driver")}
		rec := callP(newAPI(fs, nil, nil).StartTrip, http.MethodPost, "/me/trips/t1/start",
			`{"clientTime":"2026-09-21T10:41:07.123Z"}`, &driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusForbidden)
	})
}

func TestReached(t *testing.T) {
	t.Run("a missing idempotency key is refused", func(t *testing.T) {
		fs := &fakeStore{getTrip: inProgressTrip()}
		rec := callP(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("the store is given the principal's uid", func(t *testing.T) {
		fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2}}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")

		requireStatus(t, rec, http.StatusCreated)
		if fs.reachedWith.driverUID != driverPrincipal.UID {
			t.Fatalf("store received uid %q, want the principal's %q",
				fs.reachedWith.driverUID, driverPrincipal.UID)
		}
		if fs.reachedWith.key != "key-1" {
			t.Fatalf("idempotency key = %q", fs.reachedWith.key)
		}
	})

	t.Run("a photo that does not exist in storage is refused", func(t *testing.T) {
		fs := &fakeStore{getTrip: inProgressTrip()}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{}).Reached, http.MethodPost,
			"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("a failed delivery is still recorded", func(t *testing.T) {
		body := `{"seq":1,"lat":35.6839,"lng":139.7744,"clientTime":"2026-09-21T10:41:07.123Z",` +
			`"deliveryStatus":"failed","photoPath":"trips/t1/1.jpg"}`
		fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2}}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", body, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusCreated)
	})

	t.Run("an out-of-radius capture is not rejected", func(t *testing.T) {
		body := `{"seq":1,"lat":35.0,"lng":139.0,"clientTime":"2026-09-21T10:41:07.123Z",` +
			`"deliveryStatus":"delivered","photoPath":"trips/t1/1.jpg"}`
		fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2, MatchStatus: domain.MatchSuspect}}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", body, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusCreated)
	})

	t.Run("a home stop is recorded with a position and no photo", func(t *testing.T) {
		trip := inProgressTrip()
		trip.CurrentStopSeq = 2
		body := `{"seq":2,"lat":35.6839,"lng":139.7744,"clientTime":"2026-09-21T10:41:07.123Z",` +
			`"deliveryStatus":"delivered"}`
		fs := &fakeStore{getTrip: trip, reached: &domain.ReachedResponse{EventID: "e2", Seq: 2}}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{}).Reached, http.MethodPost,
			"/me/trips/t1/reached", body, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusCreated)
	})

	t.Run("a home stop without a position is refused", func(t *testing.T) {
		trip := inProgressTrip()
		trip.CurrentStopSeq = 2
		body := `{"seq":2,"clientTime":"2026-09-21T10:41:07.123Z","deliveryStatus":"delivered"}`
		fs := &fakeStore{getTrip: trip}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{}).Reached, http.MethodPost,
			"/me/trips/t1/reached", body, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("a stop the trip does not have is refused", func(t *testing.T) {
		body := `{"seq":9,"lat":35.6839,"lng":139.7744,"clientTime":"2026-09-21T10:41:07.123Z",` +
			`"deliveryStatus":"delivered","photoPath":"trips/t1/9.jpg"}`
		fs := &fakeStore{getTrip: inProgressTrip()}
		rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
			"/me/trips/t1/reached", body, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("store lifecycle conflicts keep their code", func(t *testing.T) {
		for _, code := range []domain.Code{
			domain.CodeOutOfOrder, domain.CodeAlreadyRecorded, domain.CodeTripNotActive,
		} {
			t.Run(string(code), func(t *testing.T) {
				fs := &fakeStore{
					getTrip:    inProgressTrip(),
					reachedErr: domain.Conflict(code, "nope"),
				}
				rec := callIdem(newAPI(fs, nil, &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 42}}).Reached, http.MethodPost,
					"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")
				requireStatus(t, rec, http.StatusConflict)
				if got := errCode(t, rec); got != string(code) {
					t.Fatalf("code = %q, want %q", got, code)
				}
			})
		}
	})
}

// A V4 signed PUT cannot cap its own size, so the only place an oversized photo can be refused is here, once the object exists.
func TestReachedRefusesAnOversizedPhoto(t *testing.T) {
	fs := &fakeStore{getTrip: inProgressTrip()}
	photos := &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: media.MaxPhotoBytes + 1}}

	rec := callIdem(newAPI(fs, nil, photos).Reached, http.MethodPost,
		"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")

	requireStatus(t, rec, http.StatusBadRequest)

	if fs.reachedWith.key != "" {
		t.Fatal("an oversized photo still recorded the stop")
	}
	photos.mu.Lock()
	deleted := append([]string(nil), photos.deleted...)
	photos.mu.Unlock()
	if len(deleted) != 1 || deleted[0] != "trips/t1/1.jpg" {
		t.Fatalf("the oversized object was not removed; deleted = %v", deleted)
	}
}

func TestReachedAcceptsAPhotoAtTheLimit(t *testing.T) {
	fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2}}
	photos := &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: media.MaxPhotoBytes}}

	rec := callIdem(newAPI(fs, nil, photos).Reached, http.MethodPost,
		"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")

	requireStatus(t, rec, http.StatusCreated)
	if len(photos.deleted) != 0 {
		t.Fatal("a photo exactly at the limit was deleted")
	}
}

// The generation pins which version of a re-uploadable path is this stop's evidence.
func TestReachedPinsThePhotoGeneration(t *testing.T) {
	fs := &fakeStore{getTrip: inProgressTrip(), reached: &domain.ReachedResponse{NextSeq: 2}}
	photos := &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1 << 20, Generation: 1700000000000001}}

	rec := callIdem(newAPI(fs, nil, photos).Reached, http.MethodPost,
		"/me/trips/t1/reached", validReached, &driverPrincipal, map[string]string{"id": "t1"}, "key-1")

	requireStatus(t, rec, http.StatusCreated)
	if fs.reachedWith.generation != 1700000000000001 {
		t.Fatalf("generation reaching the store = %d, want the one Storage reported",
			fs.reachedWith.generation)
	}
}

func TestPhotoURLPinsTheContentType(t *testing.T) {
	fs := &fakeStore{getTrip: inProgressTrip()}
	rec := callP(newAPI(fs, nil, &fakePhotos{uploadURL: "https://signed"}).PhotoURL, http.MethodPost,
		"/me/trips/t1/photo-url", `{"seq":1,"contentType":"image/png"}`, &driverPrincipal,
		map[string]string{"id": "t1"})
	requireStatus(t, rec, http.StatusBadRequest)
}

func TestCompleteTripSurfacesStopsRemaining(t *testing.T) {
	fs := &fakeStore{
		getTrip:     inProgressTrip(),
		completeErr: domain.Conflict(domain.CodeStopsRemaining, "1 stop(s) still need recording"),
	}
	rec := callP(newAPI(fs, nil, nil).CompleteTrip, http.MethodPost, "/me/trips/t1/complete",
		`{"clientTime":"2026-09-21T10:41:07.123Z"}`, &driverPrincipal, map[string]string{"id": "t1"})

	requireStatus(t, rec, http.StatusConflict)
	if got := errCode(t, rec); got != string(domain.CodeStopsRemaining) {
		t.Fatalf("code = %q, want STOPS_REMAINING", got)
	}
}

func TestStartTripSurfacesDriverBusy(t *testing.T) {
	trip := inProgressTrip()
	trip.Status = domain.TripAssigned
	fs := &fakeStore{
		getTrip:  trip,
		startErr: domain.Conflict(domain.CodeDriverBusy, "finish your trip in progress first"),
	}
	rec := callP(newAPI(fs, nil, nil).StartTrip, http.MethodPost, "/me/trips/t1/start",
		`{"clientTime":"2026-09-21T10:41:07.123Z"}`, &driverPrincipal, map[string]string{"id": "t1"})

	requireStatus(t, rec, http.StatusConflict)
	if got := errCode(t, rec); got != string(domain.CodeDriverBusy) {
		t.Fatalf("code = %q, want DRIVER_BUSY", got)
	}
}

func TestMeReturnsTheSignedInUser(t *testing.T) {
	fs := &fakeStore{getUser: domain.User{Role: domain.RoleDriver, Name: "Sato", Active: true}}
	rec := call(newAPI(fs, nil, nil).Me, http.MethodGet, "/me", "", &driverPrincipal)
	requireStatus(t, rec, http.StatusOK)
}

func TestMeSurfacesAMissingUserDocument(t *testing.T) {
	fs := &fakeStore{getUserErr: domain.NotFound("that user was not found")}
	rec := call(newAPI(fs, nil, nil).Me, http.MethodGet, "/me", "", &driverPrincipal)
	requireStatus(t, rec, http.StatusNotFound)
}

func TestMyTripsSurfacesStoreFailures(t *testing.T) {
	fs := &fakeStore{driverTripsErr: errors.New("firestore unavailable")}
	rec := call(newAPI(fs, nil, nil).MyTrips, http.MethodGet, "/me/trips", "", &driverPrincipal)
	requireStatus(t, rec, http.StatusInternalServerError)
	if got := errCode(t, rec); got != string(domain.CodeInternal) {
		t.Fatalf("code = %q, want INTERNAL", got)
	}
}

// The driver is the person a route change happens to.
func TestNextStopCarriesTheRouteNote(t *testing.T) {
	note := &domain.RouteNote{
		Reason: "Sugamo cancelled, go to Komagome",
		At:     at("01:20"),
		ByRole: domain.RoleAdmin,
	}
	withNote := func(trip domain.Trip) domain.Trip {
		trip.RouteNote = note
		return trip
	}
	running := domain.Trip{
		ID: "t1", DriverUID: driverPrincipal.UID, Status: domain.TripInProgress, CurrentStopSeq: 1,
		RouteSnapshot: domain.RouteSnapshot{
			Stops: []domain.SnapshotStop{{Seq: 1, Type: domain.StopShop, ShopName: "Sugamo"}},
		},
	}

	ask := func(trip domain.Trip) domain.NextStopResponse {
		t.Helper()
		rec := callP(newAPI(&fakeStore{getTrip: trip}, nil, nil).NextStop, http.MethodGet,
			"/me/trips/t1/next", "", &driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusOK)
		var got domain.NextStopResponse
		decode(t, rec, &got)
		return got
	}

	t.Run("alongside the next stop", func(t *testing.T) {
		got := ask(withNote(running))
		if got.Note == nil {
			t.Fatal("the driver was told nothing about the route change")
		}
		if got.Note.Reason != note.Reason {
			t.Fatalf("note = %q, want %q", got.Note.Reason, note.Reason)
		}
		if got.ShopName != "Sugamo" {
			t.Fatalf("shopName = %q, want the stop as well as the note", got.ShopName)
		}
	})

	t.Run("says nothing when the route was never changed", func(t *testing.T) {
		if got := ask(running); got.Note != nil {
			t.Fatalf("note = %+v, want none", got.Note)
		}
	})

	t.Run("on a trip the driver has not started yet", func(t *testing.T) {
		assigned := withNote(running)
		assigned.Status = domain.TripAssigned
		if got := ask(assigned); got.Note == nil {
			t.Fatal("a driver who has not set off is still owed the reason")
		}
	})

	t.Run("on a trip with every stop recorded", func(t *testing.T) {
		done := withNote(running)
		done.CurrentStopSeq = len(done.RouteSnapshot.Stops) + 1

		got := ask(done)
		if !got.Done {
			t.Fatalf("want done, got %+v", got)
		}
		if got.Note == nil {
			t.Fatal("the note vanished the moment the last stop was recorded")
		}
	})
}

func at(hhmm string) time.Time {
	t, err := time.Parse(time.RFC3339, "2026-09-22T"+hhmm+":00Z")
	if err != nil {
		panic(err)
	}
	return t
}

func ptrInt(n int) *int { return &n }

// A driver's own record of what they did.
func TestMyHistory(t *testing.T) {
	done := []domain.Trip{
		{ID: "t2", DriverUID: driverPrincipal.UID, Status: domain.TripCompleted},
		{ID: "t1", DriverUID: driverPrincipal.UID, Status: domain.TripCompleted},
	}

	ask := func(fs *fakeStore, query string) *httptest.ResponseRecorder {
		return callP(newAPI(fs, nil, nil).MyHistory, http.MethodGet,
			"/me/trips/history"+query, "", &driverPrincipal, nil)
	}

	t.Run("answers a page, newest first, and says whether there is more", func(t *testing.T) {
		fs := &fakeStore{history: done, historyTruncated: true}
		rec := ask(fs, "")

		requireStatus(t, rec, http.StatusOK)
		var got struct {
			Trips     []domain.Trip `json:"trips"`
			Truncated bool          `json:"truncated"`
			Limit     int           `json:"limit"`
		}
		decode(t, rec, &got)

		if len(got.Trips) != 2 || got.Trips[0].ID != "t2" {
			t.Fatalf("trips = %+v, want the store's order preserved", got.Trips)
		}
		if !got.Truncated {
			t.Fatal("a full page must say there is more, or the driver cannot ask for it")
		}
		if got.Limit != store.DefaultHistoryPage {
			t.Fatalf("limit = %d, want the default %d", got.Limit, store.DefaultHistoryPage)
		}
	})

	t.Run("takes a bigger page when asked", func(t *testing.T) {
		fs := &fakeStore{history: done}
		requireStatus(t, ask(fs, "?limit=40"), http.StatusOK)
		if fs.historyLimit != 40 {
			t.Fatalf("asked the store for %d, want 40", fs.historyLimit)
		}
	})

	t.Run("clamps a page nobody should ask for", func(t *testing.T) {
		fs := &fakeStore{history: done}
		requireStatus(t, ask(fs, "?limit=100000"), http.StatusOK)
		if fs.historyLimit != store.MaxListSize {
			t.Fatalf("asked the store for %d, want the cap %d", fs.historyLimit, store.MaxListSize)
		}
	})

	t.Run("refuses a limit that is not a page size", func(t *testing.T) {
		for _, q := range []string{"?limit=0", "?limit=-3", "?limit=lots"} {
			requireStatus(t, ask(&fakeStore{}, q), http.StatusBadRequest)
		}
	})

	t.Run("surfaces a read failure rather than an empty history", func(t *testing.T) {
		fs := &fakeStore{historyErr: errors.New("firestore unavailable")}
		requireStatus(t, ask(fs, ""), http.StatusInternalServerError)
	})
}

// Tapping a row in that history has to lead somewhere: a finished trip is in no list the driver's screen already holds, so without this it landed on "this trip is gone".
func TestMyTrip(t *testing.T) {
	t.Run("answers the driver's own trip", func(t *testing.T) {
		fs := &fakeStore{getTrip: domain.Trip{ID: "t1", DriverUID: driverPrincipal.UID, Status: domain.TripCompleted}}
		rec := callP(newAPI(fs, nil, nil).MyTrip, http.MethodGet, "/me/trips/t1", "",
			&driverPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusOK)
		var got struct {
			Trip domain.Trip `json:"trip"`
		}
		decode(t, rec, &got)
		if got.Trip.ID != "t1" {
			t.Fatalf("trip = %+v", got.Trip)
		}
	})

	t.Run("refuses another driver's trip", func(t *testing.T) {
		fs := &fakeStore{getTrip: domain.Trip{ID: "t1", DriverUID: "someone-else"}}
		rec := callP(newAPI(fs, nil, nil).MyTrip, http.MethodGet, "/me/trips/t1", "",
			&driverPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusForbidden)
	})
}

func fp(v float64) *float64 { return &v }
