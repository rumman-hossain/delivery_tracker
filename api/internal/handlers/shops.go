package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) CreateShop(w http.ResponseWriter, r *http.Request) {
	var body domain.ShopRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateShop(body, true); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	id, err := a.Store.CreateShop(r.Context(), body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"shopId": id})
}

func (a *API) ListShops(w http.ResponseWriter, r *http.Request) {
	shops, err := a.Store.ListShops(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"shops": shops})
}

func (a *API) UpdateShop(w http.ResponseWriter, r *http.Request) {
	var body domain.ShopRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateShop(body, false); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := a.Store.UpdateShop(r.Context(), chi.URLParam(r, "id"), body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
