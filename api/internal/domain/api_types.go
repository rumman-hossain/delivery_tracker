package domain

import (
	"time"
)

// BaseCapture is the best-effort GPS sent with START and COMPLETE.
type BaseCapture struct {
	Lat        *float64 `json:"lat"`
	Lng        *float64 `json:"lng"`
	AccuracyM  *float64 `json:"accuracyM"`
	ClientTime string   `json:"clientTime"`
}

type ReachedRequest struct {
	Seq            int      `json:"seq"`
	Lat            *float64 `json:"lat"`
	Lng            *float64 `json:"lng"`
	AccuracyM      *float64 `json:"accuracyM"`
	SampleCount    *int     `json:"sampleCount"`
	Speed          *float64 `json:"speed"`
	Heading        *float64 `json:"heading"`
	ClientTime     string   `json:"clientTime"`
	DeliveryStatus Delivery `json:"deliveryStatus"`
	PhotoPath      string   `json:"photoPath"`

	Note string `json:"note,omitempty"`
}

type ReachedResponse struct {
	EventID     string     `json:"eventId"`
	Seq         int        `json:"seq"`
	ServerTime  time.Time  `json:"serverTime"`
	DistanceM   *float64   `json:"distanceM"`
	MatchStatus Match      `json:"matchStatus"`
	NextSeq     int        `json:"nextSeq"`
	TripStatus  TripStatus `json:"tripStatus"`
}

// RouteNote is the latest admin note about a change to this route.
type RouteNote struct {
	Reason string    `json:"reason"`
	At     time.Time `json:"at"`
	ByRole Role      `json:"byRole,omitempty"`
}

type NextStopResponse struct {
	Done            bool     `json:"done,omitempty"`
	Seq             int      `json:"seq,omitempty"`
	Type            StopType `json:"type,omitempty"`
	ShopName        string   `json:"shopName,omitempty"`
	Label           string   `json:"label,omitempty"`
	ExpectedLat     *float64 `json:"expectedLat,omitempty"`
	ExpectedLng     *float64 `json:"expectedLng,omitempty"`
	ExpectedRadiusM *float64 `json:"expectedRadiusM,omitempty"`

	Note *RouteNote `json:"note,omitempty"`
}

type PhotoURLRequest struct {
	Seq         int    `json:"seq"`
	ContentType string `json:"contentType"`
}

type PhotoURLResponse struct {
	UploadURL string    `json:"uploadURL"`
	PhotoPath string    `json:"photoPath"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type CreateUserRequest struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	TempPassword string `json:"tempPassword"`
	Role         Role   `json:"role"`
}

type UpdateUserRequest struct {
	Name   *string `json:"name"`
	Phone  *string `json:"phone"`
	Active *bool   `json:"active"`

	PhotoPath *string `json:"-"`
}

// EditTripStopsRequest replaces the stops a driver has not reached yet.
type EditTripStopsRequest struct {
	Stops        []Stop `json:"stops"`
	FromStopSeq  int    `json:"fromStopSeq"`
	RouteVersion int    `json:"routeVersion"`
	Reason       string `json:"reason"`
}

// ResetPasswordRequest sets another user's password.
type ResetPasswordRequest struct {
	NewPassword string `json:"newPassword"`
}

// ShopRequest serves both POST (all of Name/Lat/Lng required) and PATCH (any subset).
type ShopRequest struct {
	Kind    *LocationKind     `json:"kind"`
	Name    *string           `json:"name"`
	Lat     Nullable[float64] `json:"lat"`
	Lng     Nullable[float64] `json:"lng"`
	Address *string           `json:"address"`
	RadiusM Nullable[float64] `json:"radiusM"`
	Active  *bool             `json:"active"`
}

type ConfigRequest struct {
	MatchRadiusM *float64 `json:"matchRadiusM"`
}

// RouteRequest carries place *ids* for the two ends, never coordinates.
type RouteRequest struct {
	Name         *string `json:"name"`
	StartPlaceID *string `json:"startPlaceId"`
	EndPlaceID   *string `json:"endPlaceId"`
	Stops        []Stop  `json:"stops"`
	Active       *bool   `json:"active"`
}

type AssignTripRequest struct {
	RouteID      string `json:"routeId"`
	DriverUID    string `json:"driverUid"`
	AssignedDate string `json:"assignedDate"`
}

// ReassignTripRequest hands an assigned trip to a different driver.
type ReassignTripRequest struct {
	DriverUID string `json:"driverUid"`
}

type CorrectionRequest struct {
	TargetEventID string         `json:"targetEventId"`
	Changes       map[string]any `json:"changes"`
	Reason        string         `json:"reason"`
}
