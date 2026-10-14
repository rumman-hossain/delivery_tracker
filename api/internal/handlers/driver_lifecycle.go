package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) StartTrip(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	var body domain.BaseCapture
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateBaseCapture(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	status, nextSeq, err := a.Store.StartTrip(r.Context(), chi.URLParam(r, "id"), p.UID, body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"tripStatus": status, "nextSeq": nextSeq})
}

// NextStop returns only the stop the driver may record now.
func (a *API) NextStop(w http.ResponseWriter, r *http.Request) {
	trip, err := a.ownTrip(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	next := trip.NextStop()

	next.Note = trip.RouteNote

	httpx.WriteJSON(w, http.StatusOK, next)
}

func (a *API) CompleteTrip(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	var body domain.BaseCapture
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateBaseCapture(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	status, err := a.Store.CompleteTrip(r.Context(), chi.URLParam(r, "id"), p.UID, body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"tripStatus": status})
}
