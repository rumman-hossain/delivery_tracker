package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

var (
	ownDriver    = domain.User{Role: domain.RoleDriver, CreatedBy: adminPrincipal.UID}
	othersDriver = domain.User{Role: domain.RoleDriver, CreatedBy: "admin-2"}
	peerAdmin    = domain.User{Role: domain.RoleAdmin, CreatedBy: superadminPrincipal.UID}
	theSuperuser = domain.User{Role: domain.RoleSuperadmin}
)

func TestListTripsValidatesTheStatusFilter(t *testing.T) {
	cases := []struct {
		query string
		want  int
	}{
		{"", http.StatusOK},
		{"?status=assigned", http.StatusOK},
		{"?status=in_progress", http.StatusOK},
		{"?status=completed", http.StatusOK},
		{"?status=inprogress", http.StatusBadRequest},
		{"?status=nonsense", http.StatusBadRequest},
	}
	for _, c := range cases {
		name := c.query
		if name == "" {
			name = "(no filter)"
		}
		t.Run(name, func(t *testing.T) {
			rec := call(newAPI(nil, nil, nil).ListTrips, http.MethodGet, "/admin/trips"+c.query, "", &adminPrincipal)
			requireStatus(t, rec, c.want)
		})
	}
}

func TestListTripsPassesFiltersThrough(t *testing.T) {
	fs := &fakeStore{}
	rec := call(newAPI(fs, nil, nil).ListTrips, http.MethodGet,
		"/admin/trips?driver=d1&date=2026-09-22&status=completed", "", &adminPrincipal)

	requireStatus(t, rec, http.StatusOK)
	if fs.listTripsWith.DriverUID != "d1" || fs.listTripsWith.Date != "2026-09-22" ||
		fs.listTripsWith.Status != domain.TripCompleted {
		t.Fatalf("filters = %+v", fs.listTripsWith)
	}
}

// A capped list must say so.
func TestListTripsReportsTruncation(t *testing.T) {
	t.Run("a short list is not flagged", func(t *testing.T) {
		fs := &fakeStore{listTrips: []domain.Trip{{ID: "t1"}}}
		rec := call(newAPI(fs, nil, nil).ListTrips, http.MethodGet, "/admin/trips", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		var body struct {
			Truncated bool `json:"truncated"`
			Limit     int  `json:"limit"`
		}
		decode(t, rec, &body)
		if body.Truncated {
			t.Fatal("a one-trip list was reported as truncated")
		}
		if body.Limit != store.MaxListSize {
			t.Fatalf("limit = %d, want %d", body.Limit, store.MaxListSize)
		}
	})

	t.Run("a capped list is flagged", func(t *testing.T) {
		fs := &fakeStore{listTrips: []domain.Trip{{ID: "t1"}}, listTripsTruncated: true}
		rec := call(newAPI(fs, nil, nil).ListTrips, http.MethodGet, "/admin/trips", "", &adminPrincipal)

		requireStatus(t, rec, http.StatusOK)
		var body struct {
			Truncated bool `json:"truncated"`
		}
		decode(t, rec, &body)
		if !body.Truncated {
			t.Fatal("a truncated list was not flagged")
		}
	})
}

func TestAssignTripRespectsOwnership(t *testing.T) {
	body := `{"routeId":"r1","driverUid":"d1","assignedDate":"2026-09-22"}`

	cases := []struct {
		name       string
		actor      auth.Principal
		target     domain.User
		wantStatus int
	}{
		{"a superadmin assigns to any driver", superadminPrincipal, othersDriver, http.StatusCreated},
		{"an admin assigns to their own driver", adminPrincipal, ownDriver, http.StatusCreated},
		{"an admin cannot assign to another admin's driver", adminPrincipal, othersDriver, http.StatusNotFound},
		{"an admin cannot assign to a peer", adminPrincipal, peerAdmin, http.StatusNotFound},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fs := &fakeStore{getUser: c.target, assignTripID: "trip-1"}
			actor := c.actor
			rec := call(newAPI(fs, nil, nil).AssignTrip, http.MethodPost, "/admin/trips", body, &actor)

			requireStatus(t, rec, c.wantStatus)
			if c.wantStatus == http.StatusNotFound && fs.assignedTrip != nil {
				t.Fatal("the trip was created before the permission check")
			}
		})
	}
}

func TestEditTripStops(t *testing.T) {
	good := `{"stops":[{"seq":1,"type":"shop","shopId":"s1"}],"fromStopSeq":1,"routeVersion":0,"reason":"shop closed early"}`
	ownTrip := domain.Trip{ID: "t1", DriverUID: "d1"}

	t.Run("passes the acting principal through for the audit record", func(t *testing.T) {
		fs := &fakeStore{getTrip: ownTrip, getUser: ownDriver}
		actor := superadminPrincipal
		rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
			good, &actor, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusOK)
		if fs.editedByUID != actor.UID || fs.editedByRole != actor.Role {
			t.Fatalf("recorded %s/%s, want %s/%s", fs.editedByUID, fs.editedByRole, actor.UID, actor.Role)
		}
	})

	t.Run("a change with no reason is refused", func(t *testing.T) {
		fs := &fakeStore{getTrip: ownTrip, getUser: ownDriver}
		rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
			`{"stops":[{"seq":1,"type":"shop","shopId":"s1"}],"fromStopSeq":1,"routeVersion":0,"reason":"  "}`,
			&adminPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusBadRequest)
		if fs.editedStops != nil {
			t.Fatal("the store was reached despite an invalid request")
		}
	})

	t.Run("emptying the pending tail is allowed", func(t *testing.T) {
		fs := &fakeStore{getTrip: ownTrip, getUser: ownDriver}
		rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
			`{"stops":[],"fromStopSeq":1,"routeVersion":0,"reason":"rest of the round cancelled"}`,
			&adminPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusOK)
	})

	t.Run("a malformed stop is refused before the store", func(t *testing.T) {
		fs := &fakeStore{getTrip: ownTrip, getUser: ownDriver}
		rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
			`{"stops":[{"seq":1,"type":"shop"}],"fromStopSeq":1,"routeVersion":0,"reason":"x"}`,
			&adminPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusBadRequest)
		if fs.editedStops != nil {
			t.Fatal("a shop stop with no shopId reached the store")
		}
	})
}

// Acting on a trip is acting on that driver's account, even though trips are shared for reading.
func TestTripActionsRespectDriverOwnership(t *testing.T) {
	trip := domain.Trip{ID: "t1", DriverUID: "d1"}

	cases := []struct {
		name   string
		driver domain.User
		want   int
	}{
		{"their own driver", ownDriver, http.StatusOK},
		{"another admin's driver", othersDriver, http.StatusNotFound},
	}

	for _, c := range cases {
		t.Run("editing stops for "+c.name, func(t *testing.T) {
			fs := &fakeStore{getTrip: trip, getUser: c.driver}
			rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
				`{"stops":[],"fromStopSeq":1,"routeVersion":0,"reason":"round cancelled"}`,
				&adminPrincipal, map[string]string{"id": "t1"})

			requireStatus(t, rec, c.want)
			if c.want == http.StatusNotFound && fs.editedStops != nil {
				t.Fatal("the route was rewritten before the permission check")
			}
		})

		t.Run("correcting an event for "+c.name, func(t *testing.T) {
			fs := &fakeStore{getTrip: trip, getUser: c.driver, correctionID: "corr-1"}
			want := c.want
			if want == http.StatusOK {
				want = http.StatusCreated
			}
			rec := callP(newAPI(fs, nil, nil).CreateCorrection, http.MethodPost, "/admin/trips/t1/corrections",
				`{"targetEventId":"ev-1","changes":{"matchStatus":"matched"},"reason":"pin was wrong"}`,
				&adminPrincipal, map[string]string{"id": "t1"})

			requireStatus(t, rec, want)
			if c.want == http.StatusNotFound && fs.correctionByUID != "" {
				t.Fatal("the correction was filed before the permission check")
			}
		})
	}
}

// currentStopSeq catches the driver moving.
func TestEditTripStopsRefusesAStaleEdit(t *testing.T) {
	fs := &fakeStore{getTrip: domain.Trip{ID: "t1", DriverUID: "d1"}, getUser: ownDriver}
	rec := callP(newAPI(fs, nil, nil).EditTripStops, http.MethodPatch, "/admin/trips/t1/stops",
		`{"stops":[],"fromStopSeq":4,"routeVersion":2,"reason":"round cut short"}`,
		&adminPrincipal, map[string]string{"id": "t1"})

	requireStatus(t, rec, http.StatusOK)
	if fs.editedStops == nil {
		t.Fatal("the request never reached the store")
	}
	if fs.editedStops.FromStopSeq != 4 || fs.editedStops.RouteVersion != 2 {
		t.Fatalf("store got fromStopSeq=%d routeVersion=%d, want 4 and 2",
			fs.editedStops.FromStopSeq, fs.editedStops.RouteVersion)
	}
}

// Reading a trip and acting on it are different permissions, so the read has to say which one the caller has.
func TestGetTripSaysWhetherTheCallerMayActOnIt(t *testing.T) {
	trip := domain.Trip{ID: "t1", DriverUID: "d1"}

	cases := []struct {
		name   string
		actor  auth.Principal
		driver domain.User
		want   bool
	}{
		{"their own driver", adminPrincipal, ownDriver, true},
		{"another admin's driver", adminPrincipal, othersDriver, false},
		{"a superadmin acts on anyone", superadminPrincipal, othersDriver, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fs := &fakeStore{getTrip: trip, getUser: c.driver}
			actor := c.actor
			rec := callP(newAPI(fs, nil, nil).GetTrip, http.MethodGet, "/admin/trips/t1", "",
				&actor, map[string]string{"id": "t1"})

			requireStatus(t, rec, http.StatusOK)
			var got struct {
				CanAct *bool `json:"canAct"`
			}
			decode(t, rec, &got)
			if got.CanAct == nil {
				t.Fatalf("canAct was left undetermined, want %v", c.want)
			}
			if *got.CanAct != c.want {
				t.Fatalf("canAct = %v, want %v", *got.CanAct, c.want)
			}
		})
	}

	t.Run("a driver who is not there reads but cannot be acted on", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, getUserErr: domain.NotFound("that user")}
		rec := callP(newAPI(fs, nil, nil).GetTrip, http.MethodGet, "/admin/trips/t1", "",
			&adminPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusOK)
		var got struct {
			CanAct *bool `json:"canAct"`
		}
		decode(t, rec, &got)
		if got.CanAct == nil || *got.CanAct {
			t.Fatal("a driver the server could not find must be a definite no")
		}
	})

	t.Run("a failed lookup is neither a yes nor a no", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, getUserErr: domain.Internal("firestore is unreachable")}
		rec := callP(newAPI(fs, nil, &fakePhotos{}).GetTrip, http.MethodGet, "/admin/trips/t1", "",
			&adminPrincipal, map[string]string{"id": "t1"})

		requireStatus(t, rec, http.StatusOK)

		var got struct {
			CanAct *bool `json:"canAct"`
		}
		decode(t, rec, &got)
		if got.CanAct != nil {
			t.Fatalf("canAct = %v, want it left undetermined", *got.CanAct)
		}
	})
}

// A database that cannot be read is not an answer about permission -- but it is also no reason to withhold the timeline.
func TestGetTripStaysReadableWhenPermissionCannotBeDecided(t *testing.T) {
	fs := &fakeStore{
		getTrip:    domain.Trip{ID: "t1", DriverUID: "d1"},
		getUserErr: errors.New("firestore unavailable"),
	}
	rec := callP(newAPI(fs, nil, &fakePhotos{}).GetTrip, http.MethodGet, "/admin/trips/t1", "",
		&adminPrincipal, map[string]string{"id": "t1"})

	requireStatus(t, rec, http.StatusOK)

	var got struct {
		Trip   domain.Trip    `json:"trip"`
		Events []domain.Event `json:"events"`
		CanAct *bool          `json:"canAct"`
	}
	decode(t, rec, &got)

	if got.CanAct != nil {
		t.Fatalf("canAct = %v, want it left undetermined", *got.CanAct)
	}
	if got.Trip.ID != "t1" {
		t.Fatalf("trip = %+v, want the trip to still be readable", got.Trip)
	}
}

// Handing a trip to a different driver.
func TestReassignTrip(t *testing.T) {
	trip := domain.Trip{ID: "t1", DriverUID: "d1", Status: domain.TripAssigned}
	newDriver := domain.User{UID: "d2", Role: domain.RoleDriver, Name: "Yamada", Active: true, CreatedBy: adminPrincipal.UID}

	call := func(fs *fakeStore, actor auth.Principal, body string) *httptest.ResponseRecorder {
		return callP(newAPI(fs, nil, nil).ReassignTrip, http.MethodPatch, "/admin/trips/t1/driver",
			body, &actor, map[string]string{"id": "t1"})
	}

	t.Run("hands it over and answers with the trip", func(t *testing.T) {
		fs := &fakeStore{
			getTrip: trip, getUser: newDriver,
			reassignedTrip: domain.Trip{ID: "t1", DriverUID: "d2", DriverName: "Yamada", Status: domain.TripAssigned},
		}
		rec := call(fs, adminPrincipal, `{"driverUid":"d2"}`)

		requireStatus(t, rec, http.StatusOK)
		if fs.reassignedTo != "d2" {
			t.Fatalf("handed to %q, want d2", fs.reassignedTo)
		}
		var got struct {
			Trip domain.Trip `json:"trip"`
		}
		decode(t, rec, &got)
		if got.Trip.DriverName != "Yamada" {
			t.Fatalf("trip came back with driver %q", got.Trip.DriverName)
		}
	})

	t.Run("refuses a driver the caller may not touch", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, getUser: domain.User{UID: "d2", Role: domain.RoleDriver, Active: true, CreatedBy: "another-admin"}}
		rec := call(fs, adminPrincipal, `{"driverUid":"d2"}`)

		requireStatus(t, rec, http.StatusNotFound)
		if fs.reassignedTo != "" {
			t.Fatal("the store was asked to reassign anyway")
		}
	})

	t.Run("refuses an account that is not a driver", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, getUser: domain.User{UID: "a2", Role: domain.RoleAdmin, Active: true}}
		requireStatus(t, call(fs, superadminPrincipal, `{"driverUid":"a2"}`), http.StatusBadRequest)
	})

	t.Run("refuses a deactivated driver", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip, getUser: domain.User{UID: "d2", Role: domain.RoleDriver, Active: false}}
		requireStatus(t, call(fs, superadminPrincipal, `{"driverUid":"d2"}`), http.StatusBadRequest)
	})

	t.Run("refuses an empty driver", func(t *testing.T) {
		fs := &fakeStore{getTrip: trip}
		requireStatus(t, call(fs, adminPrincipal, `{"driverUid":"  "}`), http.StatusBadRequest)
	})

	t.Run("passes on the store's refusal for a trip already running", func(t *testing.T) {
		fs := &fakeStore{
			getTrip: trip, getUser: newDriver,
			reassignErr: domain.Conflict(domain.CodeTripNotActive, "this trip has already started"),
		}
		rec := call(fs, adminPrincipal, `{"driverUid":"d2"}`)
		requireStatus(t, rec, http.StatusConflict)
		if got := errCode(t, rec); got != string(domain.CodeTripNotActive) {
			t.Fatalf("code = %q, want TRIP_NOT_ACTIVE", got)
		}
	})
}
