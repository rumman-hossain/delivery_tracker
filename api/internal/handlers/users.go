package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) CreateUser(w http.ResponseWriter, r *http.Request) {
	var body domain.CreateUserRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateCreateUser(body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	p := auth.MustPrincipal(r.Context())
	if !domain.CanCreateRole(p.Role, body.Role) {
		httpx.WriteError(w, r, domain.Forbidden("your account cannot create a user with that role"))
		return
	}

	uid, err := a.Provisioner.Create(r.Context(), body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := a.Store.PutUser(r.Context(), uid, domain.User{
		Role: body.Role, Name: body.Name, Email: body.Email, Phone: strings.TrimSpace(body.Phone), Active: true,
		CreatedBy: p.UID,
	}); err != nil {
		if delErr := a.Provisioner.Delete(r.Context(), uid); delErr != nil {
			log.Printf("orphaned firebase account %s: rollback failed after %v: %v", uid, err, delErr)
		}
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"uid": uid})
}

func (a *API) ListUsers(w http.ResponseWriter, r *http.Request) {
	role := domain.Role(r.URL.Query().Get("role"))
	if role != "" && role != domain.RoleAdmin && role != domain.RoleDriver && role != domain.RoleSuperadmin {
		httpx.WriteError(w, r, domain.BadRequest(`role must be "admin", "driver" or "superadmin"`))
		return
	}
	users, err := a.Store.ListUsers(r.Context(), role)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	p := auth.MustPrincipal(r.Context())
	users = domain.ScopeUserList(users, p.Role, p.UID)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}

// ResetUserPassword sets someone else's password on their behalf.
func (a *API) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	uid := chi.URLParam(r, "uid")

	var body domain.ResetPasswordRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := domain.ValidateResetPassword(body, uid == p.UID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if _, err := a.authorizedTarget(r, p, uid); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if err := a.Provisioner.ResetPassword(r.Context(), uid, body.NewPassword); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) UpdateUser(w http.ResponseWriter, r *http.Request) {
	var body domain.UpdateUserRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	p := auth.MustPrincipal(r.Context())
	uid := chi.URLParam(r, "uid")

	if err := domain.ValidateUpdateUser(body, uid == p.UID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if _, err := a.authorizedTarget(r, p, uid); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if body.Active != nil {
		if err := a.Provisioner.SetActive(r.Context(), uid, *body.Active); err != nil {
			httpx.WriteError(w, r, err)
			return
		}
	}

	if err := a.Store.UpdateUser(r.Context(), uid, body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
