package handlers

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

// EventPhotoPath is the API path a proof photo is served from.
func EventPhotoPath(tripID, eventID string) string {
	return "/admin/trips/" + tripID + "/events/" + eventID + "/photo"
}

// GetEventPhoto streams one proof photo.
func (a *API) GetEventPhoto(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")

	if _, err := a.Store.GetTrip(r.Context(), tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	ev, err := a.Store.GetEvent(r.Context(), tripID, chi.URLParam(r, "eventId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if ev.PhotoPath == "" {
		httpx.WriteError(w, r, domain.NotFound("no photo was stored for that event"))
		return
	}

	rc, info, err := a.Photos.OpenObject(r.Context(), ev.PhotoPath, ev.PhotoGeneration)
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

func writePhoto(w http.ResponseWriter, r *http.Request, info media.ObjectInfo, rc io.Reader) {
	w.Header().Set("Content-Type", media.PhotoContentType)
	if info.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size, 10))
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Add("Vary", "Authorization")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if _, cErr := io.Copy(w, rc); cErr != nil {
		slog.WarnContext(r.Context(), "photo cut short", "path", r.URL.Path, "err", cErr)
	}
}
