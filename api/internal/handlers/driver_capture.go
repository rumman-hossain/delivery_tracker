package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

// IdempotencyHeader carries one key per tap, reused across that tap's retries.
const IdempotencyHeader = "Idempotency-Key"

func (a *API) PhotoURL(w http.ResponseWriter, r *http.Request) {
	var body domain.PhotoURLRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if body.ContentType != media.PhotoContentType {
		httpx.WriteError(w, r, domain.BadRequest("photos must be "+media.PhotoContentType))
		return
	}

	trip, err := a.ownTrip(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if trip.Status != domain.TripInProgress {
		httpx.WriteError(w, r, domain.Conflict(domain.CodeTripNotActive, "start this trip before uploading a photo"))
		return
	}
	if body.Seq != trip.CurrentStopSeq {
		httpx.WriteError(w, r, domain.Conflict(domain.CodeOutOfOrder, "you can only upload a photo for the stop you are recording"))
		return
	}

	object := media.PhotoPath(trip.ID, body.Seq)
	url, expires, sErr := a.Photos.SignedUploadURL(r.Context(), object)
	if sErr != nil {
		httpx.WriteError(w, r, sErr)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, domain.PhotoURLResponse{UploadURL: url, PhotoPath: object, ExpiresAt: expires})
}

// Reached records one stop.
func (a *API) Reached(w http.ResponseWriter, r *http.Request) {
	idempotencyKey := strings.TrimSpace(r.Header.Get(IdempotencyHeader))
	if idempotencyKey == "" {
		httpx.WriteError(w, r, domain.BadRequest("an "+IdempotencyHeader+" header is required"))
		return
	}

	var body domain.ReachedRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	trip, err := a.ownTrip(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if body.Seq < 1 || body.Seq > len(trip.RouteSnapshot.Stops) {
		httpx.WriteError(w, r, domain.BadRequest("this trip has no such stop"))
		return
	}
	stop := trip.RouteSnapshot.Stops[body.Seq-1]

	if vErr := domain.ValidateReached(body, stop); vErr != nil {
		httpx.WriteError(w, r, vErr)
		return
	}

	var photo media.ObjectMeta
	if body.PhotoPath != "" {
		if body.PhotoPath != media.PhotoPath(trip.ID, body.Seq) {
			httpx.WriteError(w, r, domain.BadRequest("that photoPath does not belong to this stop"))
			return
		}

		var sErr error
		photo, sErr = a.Photos.ObjectMeta(r.Context(), body.PhotoPath)
		if sErr != nil {
			httpx.WriteError(w, r, sErr)
			return
		}
		if !photo.Exists {
			httpx.WriteError(w, r, domain.BadRequest("upload the photo before recording this stop"))
			return
		}
		if photo.Size > media.MaxPhotoBytes {
			if delErr := a.Photos.DeleteObject(r.Context(), body.PhotoPath); delErr != nil {
				log.Printf("could not remove oversized photo %s: %v", body.PhotoPath, delErr)
			}
			httpx.WriteError(w, r, domain.BadRequest(fmt.Sprintf(
				"that photo is too large (limit %d MB); retake it and try again", media.MaxPhotoBytes>>20)))
			return
		}
	}

	p := auth.MustPrincipal(r.Context())
	resp, err := a.Store.Reached(r.Context(), trip.ID, p.UID, idempotencyKey, body, photo.Generation)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, resp)
}
