package handlers

import (
	"context"
	"io"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

// PhotoStore is the slice of the media layer the handlers need.
type PhotoStore interface {
	SignedUploadURL(ctx context.Context, object string) (string, time.Time, error)
	OpenObject(ctx context.Context, object string, generation int64) (io.ReadCloser, media.ObjectInfo, error)
	ObjectMeta(ctx context.Context, object string) (media.ObjectMeta, error)
	DeleteObject(ctx context.Context, object string) error
}

// Datastore is every store method the HTTP layer calls, and nothing else.
type Datastore interface {
	PutUser(ctx context.Context, uid string, u domain.User) error
	GetUser(ctx context.Context, uid string) (domain.User, error)
	ListUsers(ctx context.Context, role domain.Role) ([]domain.User, error)
	UpdateUser(ctx context.Context, uid string, req domain.UpdateUserRequest) error

	CreateShop(ctx context.Context, req domain.ShopRequest) (string, error)
	ListShops(ctx context.Context) ([]domain.Shop, error)
	UpdateShop(ctx context.Context, id string, req domain.ShopRequest) error

	CreateRoute(ctx context.Context, req domain.RouteRequest) (string, error)
	GetRoute(ctx context.Context, id string) (domain.Route, error)
	ListRoutes(ctx context.Context) ([]domain.Route, error)
	UpdateRoute(ctx context.Context, id string, req domain.RouteRequest) error

	GetConfig(ctx context.Context) (domain.AppConfig, error)
	SetConfig(ctx context.Context, radiusM float64) error

	AssignTrip(ctx context.Context, req domain.AssignTripRequest) (string, error)
	ReassignTrip(ctx context.Context, tripID string, driver domain.User) (domain.Trip, error)
	GetTrip(ctx context.Context, id string) (domain.Trip, error)
	ListTrips(ctx context.Context, f store.TripFilters) ([]domain.Trip, bool, error)
	ListTripsInDateRange(ctx context.Context, from, to string) ([]domain.Trip, error)
	ListDriverTrips(ctx context.Context, driverUID string) ([]domain.Trip, error)
	ListDriverHistory(ctx context.Context, driverUID string, limit int) ([]domain.Trip, bool, error)

	StartTrip(ctx context.Context, tripID, driverUID string, cap domain.BaseCapture) (domain.TripStatus, int, error)
	Reached(ctx context.Context, tripID, driverUID, idempotencyKey string, req domain.ReachedRequest, photoGeneration int64) (*domain.ReachedResponse, error)
	CompleteTrip(ctx context.Context, tripID, driverUID string, cap domain.BaseCapture) (domain.TripStatus, error)

	GetEvent(ctx context.Context, tripID, eventID string) (domain.Event, error)
	ListEvents(ctx context.Context, tripID string) ([]domain.Event, error)
	AppendCorrection(ctx context.Context, tripID string, actorUID string, actorRole domain.Role, req domain.CorrectionRequest) (string, error)
	EditTripStops(ctx context.Context, tripID, actorUID string, actorRole domain.Role, req domain.EditTripStopsRequest) (domain.Trip, error)
}

// AccountProvisioner is the slice of auth.Provisioner the handlers use.
type AccountProvisioner interface {
	Create(ctx context.Context, req domain.CreateUserRequest) (string, error)
	Delete(ctx context.Context, uid string) error
	SetActive(ctx context.Context, uid string, active bool) error
	ResetPassword(ctx context.Context, uid, newPassword string) error
}

type API struct {
	Store       Datastore
	Photos      PhotoStore
	Provisioner AccountProvisioner
}
