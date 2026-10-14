package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

func (a *API) MyTrips(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	trips, err := a.Store.ListDriverTrips(r.Context(), p.UID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"trips": trips})
}

// MyHistory returns the driver's own finished trips, newest first.
func (a *API) MyHistory(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	limit := store.DefaultHistoryPage
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			httpx.WriteError(w, r, domain.BadRequest("limit must be a positive whole number"))
			return
		}
		limit = min(n, store.MaxListSize)
	}

	trips, truncated, err := a.Store.ListDriverHistory(r.Context(), p.UID, limit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"trips": trips, "truncated": truncated, "limit": limit,
	})
}

// MyTrip returns one of the driver's own trips.
func (a *API) MyTrip(w http.ResponseWriter, r *http.Request) {
	trip, err := a.ownTrip(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"trip": trip})
}

func (a *API) ownTrip(r *http.Request) (domain.Trip, error) {
	p := auth.MustPrincipal(r.Context())
	trip, err := a.Store.GetTrip(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		return domain.Trip{}, err
	}
	if trip.DriverUID != p.UID {
		return domain.Trip{}, domain.Forbidden("that trip belongs to another driver")
	}
	return trip, nil
}
