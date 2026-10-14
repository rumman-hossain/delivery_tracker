package handlers

import (
	"log/slog"
	"net/http"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	u, err := a.Store.GetUser(r.Context(), p.UID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	me := map[string]any{"uid": p.UID, "name": u.Name, "role": p.Role, "phone": u.Phone}
	if u.CreatedBy != "" {
		if admin, aErr := a.Store.GetUser(r.Context(), u.CreatedBy); aErr != nil {
			slog.WarnContext(r.Context(), "could not read the creator of this driver",
				"error", aErr, "driver", p.UID, "requestId", httpx.RequestIDFrom(r.Context()))
		} else if admin.Active && admin.Phone != "" {
			me["dispatch"] = map[string]any{"name": admin.Name, "phone": admin.Phone}
		}
	}

	httpx.WriteJSON(w, http.StatusOK, me)
}
