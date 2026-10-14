package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) CreateCorrection(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	var body domain.CorrectionRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateCorrection(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	tripID := chi.URLParam(r, "id")
	if _, err := a.authorizedTrip(r, p, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	id, err := a.Store.AppendCorrection(r.Context(), tripID, p.UID, p.Role, body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"eventId": id})
}
