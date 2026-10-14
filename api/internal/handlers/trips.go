package handlers

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

// EditTripStops changes the stops a driver has not reached yet.
func (a *API) EditTripStops(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	var body domain.EditTripStopsRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateEditTripStops(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	tripID := chi.URLParam(r, "id")
	if _, err := a.authorizedTrip(r, p, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	trip, err := a.Store.EditTripStops(r.Context(), tripID, p.UID, p.Role, body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"trip": trip})
}

// ReassignTrip hands an assigned trip to a different driver.
func (a *API) ReassignTrip(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	var body domain.ReassignTripRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if strings.TrimSpace(body.DriverUID) == "" {
		httpx.WriteError(w, r, domain.BadRequest("driverUid is required"))
		return
	}

	tripID := chi.URLParam(r, "id")
	if _, err := a.authorizedTrip(r, p, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	driver, err := a.authorizedTarget(r, p, body.DriverUID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if driver.Role != domain.RoleDriver {
		httpx.WriteError(w, r, domain.BadRequest("that account is not a driver"))
		return
	}
	if !driver.Active {
		httpx.WriteError(w, r, domain.BadRequest("that driver is deactivated"))
		return
	}

	trip, err := a.Store.ReassignTrip(r.Context(), tripID, driver)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"trip": trip})
}

func (a *API) AssignTrip(w http.ResponseWriter, r *http.Request) {
	var body domain.AssignTripRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateAssignTrip(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	p := auth.MustPrincipal(r.Context())
	if _, err := a.authorizedTarget(r, p, body.DriverUID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	id, err := a.Store.AssignTrip(r.Context(), body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"tripId": id})
}

func (a *API) ListTrips(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := domain.TripStatus(q.Get("status"))
	switch status {
	case "", domain.TripAssigned, domain.TripInProgress, domain.TripCompleted:
	default:
		httpx.WriteError(w, r, domain.BadRequest(`status must be "assigned", "in_progress" or "completed"`))
		return
	}

	filters := store.TripFilters{
		DriverUID: q.Get("driver"),
		Date:      q.Get("date"),
		Status:    status,
	}
	trips, truncated, err := a.Store.ListTrips(r.Context(), filters)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"trips":     trips,
		"truncated": truncated,
		"limit":     store.MaxListSize,
	})
}

// GetTrip returns the trip, its events oldest-first, and the API path to fetch the photo of every event that carries one.
func (a *API) GetTrip(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	trip, err := a.Store.GetTrip(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	events, err := a.Store.ListEvents(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	canAct := a.mayActOnTrip(r, auth.MustPrincipal(r.Context()), trip.DriverUID)

	photos := map[string]string{}
	for _, ev := range events {
		if ev.PhotoPath != "" {
			photos[ev.ID] = EventPhotoPath(trip.ID, ev.ID)
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"trip":   trip,
		"events": events,
		"photos": photos,
		"canAct": canAct,
	})
}
