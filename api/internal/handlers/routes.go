package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) CreateRoute(w http.ResponseWriter, r *http.Request) {
	var body domain.RouteRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateRoute(body, true); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	id, err := a.Store.CreateRoute(r.Context(), body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"routeId": id})
}

func (a *API) ListRoutes(w http.ResponseWriter, r *http.Request) {
	routes, err := a.Store.ListRoutes(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"routes": routes})
}

func (a *API) GetRoute(w http.ResponseWriter, r *http.Request) {
	route, err := a.Store.GetRoute(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"route": route})
}

func (a *API) UpdateRoute(w http.ResponseWriter, r *http.Request) {
	var body domain.RouteRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateRoute(body, false); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := a.Store.UpdateRoute(r.Context(), chi.URLParam(r, "id"), body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
