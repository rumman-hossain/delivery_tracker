package handlers

import (
	"net/http"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := a.Store.GetConfig(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cfg)
}

func (a *API) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var body domain.ConfigRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateConfig(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := a.Store.SetConfig(r.Context(), *body.MatchRadiusM); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
