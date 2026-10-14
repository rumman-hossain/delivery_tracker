package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

// UserPhotoUploadURL mints the signed PUT for a person's photo.
func (a *API) UserPhotoUploadURL(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	target, err := a.authorizedTarget(r, p, chi.URLParam(r, "uid"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	object := media.UserPhotoPath(target.UID)
	url, expires, sErr := a.Photos.SignedUploadURL(r.Context(), object)
	if sErr != nil {
		httpx.WriteError(w, r, sErr)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, domain.PhotoURLResponse{UploadURL: url, PhotoPath: object, ExpiresAt: expires})
}

// ConfirmUserPhoto records the photo, once the object is really there.
func (a *API) ConfirmUserPhoto(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	target, err := a.authorizedTarget(r, p, chi.URLParam(r, "uid"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	object := media.UserPhotoPath(target.UID)
	meta, sErr := a.Photos.ObjectMeta(r.Context(), object)
	if sErr != nil {
		httpx.WriteError(w, r, sErr)
		return
	}
	if !meta.Exists {
		httpx.WriteError(w, r, domain.BadRequest("that photo has not been uploaded"))
		return
	}
	if meta.Size > media.MaxPhotoBytes {
		if delErr := a.Photos.DeleteObject(r.Context(), object); delErr != nil {
			slog.WarnContext(r.Context(), "could not remove an oversized user photo",
				"error", delErr, "object", object)
		}
		httpx.WriteError(w, r, domain.BadRequest("that photo is too large"))
		return
	}

	if err := a.Store.UpdateUser(r.Context(), target.UID, domain.UpdateUserRequest{PhotoPath: &object}); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GetUserPhoto streams a person's photo.
func (a *API) GetUserPhoto(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())

	target, err := a.authorizedTarget(r, p, chi.URLParam(r, "uid"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if target.PhotoPath == "" {
		httpx.WriteError(w, r, domain.NotFound("that person has no photo"))
		return
	}

	rc, info, err := a.Photos.OpenObject(r.Context(), target.PhotoPath, 0)
	if errors.Is(err, media.ErrObjectMissing) {
		httpx.WriteError(w, r, domain.NotFound("that photo"))
		return
	}
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	defer rc.Close()

	writePhoto(w, r, info, rc)
}
