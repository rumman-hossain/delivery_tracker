package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

func (a *API) authorizedTarget(r *http.Request, p auth.Principal, uid string) (domain.User, error) {
	target, err := a.Store.GetUser(r.Context(), uid)
	if err != nil {
		return domain.User{}, err
	}
	if !domain.CanManageUser(p.Role, p.UID, target) {
		return domain.User{}, domain.NotFound("that user")
	}
	return target, nil
}

func (a *API) authorizedTrip(r *http.Request, p auth.Principal, tripID string) (domain.Trip, error) {
	trip, err := a.Store.GetTrip(r.Context(), tripID)
	if err != nil {
		return domain.Trip{}, err
	}
	if _, err := a.authorizedTarget(r, p, trip.DriverUID); err != nil {
		return domain.Trip{}, err
	}
	return trip, nil
}

func (a *API) mayActOnTrip(r *http.Request, p auth.Principal, driverUID string) *bool {
	yes, no := true, false

	if _, err := a.authorizedTarget(r, p, driverUID); err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) && appErr.Code == domain.CodeNotFound {
			return &no
		}
		slog.WarnContext(r.Context(), "could not decide whether the caller may act on this trip",
			"error", err, "driverUid", driverUID, "requestId", httpx.RequestIDFrom(r.Context()))
		return nil
	}
	return &yes
}
