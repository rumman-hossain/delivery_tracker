package domain

import (
	"time"
)

// Kind reports the location's kind, treating an unset value as a shop.
func (s Shop) Kind() LocationKind {
	switch s.LocationKind {
	case KindWarehouse, KindHome:
		return s.LocationKind
	default:
		return KindShop
	}
}

// HasPosition reports whether this place can be matched against at all.
func (s Shop) HasPosition() bool { return s.Lat != nil && s.Lng != nil }

type User struct {
	UID   string `firestore:"-" json:"uid"`
	Role  Role   `firestore:"role" json:"role"`
	Name  string `firestore:"name" json:"name"`
	Email string `firestore:"email" json:"email"`

	PhotoPath string `firestore:"photoPath,omitempty" json:"photoPath,omitempty"`

	Phone string `firestore:"phone,omitempty" json:"phone,omitempty"`

	Active    bool      `firestore:"active" json:"active"`
	CreatedAt time.Time `firestore:"createdAt" json:"createdAt"`

	CreatedBy string `firestore:"createdBy,omitempty" json:"createdBy,omitempty"`

	ActiveTripID string `firestore:"activeTripId" json:"-"`
}

// Shop.RadiusM is nil when the shop defers to config/app.matchRadiusM.
type Shop struct {
	ID           string       `firestore:"-" json:"id"`
	LocationKind LocationKind `firestore:"kind,omitempty" json:"kind,omitempty"`
	Name         string       `firestore:"name" json:"name"`
	Lat          *float64     `firestore:"lat" json:"lat"`
	Lng          *float64     `firestore:"lng" json:"lng"`
	Address      string       `firestore:"address,omitempty" json:"address,omitempty"`
	RadiusM      *float64     `firestore:"radiusM" json:"radiusM"`
	Active       bool         `firestore:"active" json:"active"`
	CreatedAt    time.Time    `firestore:"createdAt" json:"createdAt"`

	ActiveTripID string `firestore:"activeTripId" json:"-"`
}

// AppConfig is the single config/app document.
type AppConfig struct {
	MatchRadiusM float64 `firestore:"matchRadiusM" json:"matchRadiusM"`
}

// RoutePoint is where a route begins or ends: a registered place, copied.
type RoutePoint struct {
	PlaceID string  `firestore:"placeId" json:"placeId"`
	Name    string  `firestore:"name" json:"name"`
	Lat     float64 `firestore:"lat" json:"lat"`
	Lng     float64 `firestore:"lng" json:"lng"`
}

type Stop struct {
	Seq    int      `firestore:"seq" json:"seq"`
	Type   StopType `firestore:"type" json:"type"`
	ShopID string   `firestore:"shopId,omitempty" json:"shopId,omitempty"`
	Label  string   `firestore:"label,omitempty" json:"label,omitempty"`
}

type Route struct {
	ID        string     `firestore:"-" json:"id"`
	Name      string     `firestore:"name" json:"name"`
	Start     RoutePoint `firestore:"start" json:"start"`
	End       RoutePoint `firestore:"end" json:"end"`
	Stops     []Stop     `firestore:"stops" json:"stops"`
	Active    bool       `firestore:"active" json:"active"`
	CreatedAt time.Time  `firestore:"createdAt" json:"createdAt"`

	ActiveTripID string `firestore:"activeTripId" json:"-"`
}

// SnapshotStop is frozen into the trip at assign time.
type SnapshotStop struct {
	Seq             int          `firestore:"seq" json:"seq"`
	Type            StopType     `firestore:"type" json:"type"`
	ShopID          string       `firestore:"shopId,omitempty" json:"shopId,omitempty"`
	ShopKind        LocationKind `firestore:"shopKind,omitempty" json:"shopKind,omitempty"`
	ShopName        string       `firestore:"shopName,omitempty" json:"shopName,omitempty"`
	Label           string       `firestore:"label,omitempty" json:"label,omitempty"`
	ExpectedLat     *float64     `firestore:"expectedLat,omitempty" json:"expectedLat,omitempty"`
	ExpectedLng     *float64     `firestore:"expectedLng,omitempty" json:"expectedLng,omitempty"`
	ExpectedRadiusM *float64     `firestore:"expectedRadiusM,omitempty" json:"expectedRadiusM,omitempty"`
}

// HasExpectedPosition reports whether this stop can be judged.
func (s SnapshotStop) HasExpectedPosition() bool {
	return s.ExpectedLat != nil && s.ExpectedLng != nil && s.ExpectedRadiusM != nil
}

// RouteSnapshot is the whole journey, frozen at assign time: where it starts, the stops in order, and where it ends.
type RouteSnapshot struct {
	Start RoutePoint     `firestore:"start" json:"start"`
	End   RoutePoint     `firestore:"end" json:"end"`
	Stops []SnapshotStop `firestore:"stops" json:"stops"`
}

type Trip struct {
	ID             string        `firestore:"-" json:"id"`
	RouteID        string        `firestore:"routeId" json:"routeId"`
	DriverUID      string        `firestore:"driverUid" json:"driverUid"`
	DriverName     string        `firestore:"driverName" json:"driverName"`
	AssignedDate   string        `firestore:"assignedDate" json:"assignedDate"`
	Status         TripStatus    `firestore:"status" json:"status"`
	CurrentStopSeq int           `firestore:"currentStopSeq" json:"currentStopSeq"`
	StartedAt      *time.Time    `firestore:"startedAt,omitempty" json:"startedAt,omitempty"`
	CompletedAt    *time.Time    `firestore:"completedAt,omitempty" json:"completedAt,omitempty"`
	CreatedAt      time.Time     `firestore:"createdAt" json:"createdAt"`
	RouteSnapshot  RouteSnapshot `firestore:"routeSnapshot" json:"routeSnapshot"`

	RouteVersion int `firestore:"routeVersion,omitempty" json:"routeVersion"`

	RouteNote *RouteNote `firestore:"routeNote,omitempty" json:"routeNote,omitempty"`
}

// Event documents are append-only and are never updated.
type Event struct {
	ID              string     `firestore:"-" json:"id"`
	Type            EventType  `firestore:"type" json:"type"`
	Seq             *int       `firestore:"seq,omitempty" json:"seq,omitempty"`
	ServerTime      time.Time  `firestore:"serverTime" json:"serverTime"`
	ClientTime      *time.Time `firestore:"clientTime,omitempty" json:"clientTime,omitempty"`
	TimeSkewMs      *int64     `firestore:"timeSkewMs,omitempty" json:"timeSkewMs,omitempty"`
	Lat             *float64   `firestore:"lat,omitempty" json:"lat,omitempty"`
	Lng             *float64   `firestore:"lng,omitempty" json:"lng,omitempty"`
	AccuracyM       *float64   `firestore:"accuracyM,omitempty" json:"accuracyM,omitempty"`
	SampleCount     *int       `firestore:"sampleCount,omitempty" json:"sampleCount,omitempty"`
	Speed           *float64   `firestore:"speed,omitempty" json:"speed,omitempty"`
	Heading         *float64   `firestore:"heading,omitempty" json:"heading,omitempty"`
	DistanceM       *float64   `firestore:"distanceM" json:"distanceM"`
	MatchStatus     Match      `firestore:"matchStatus,omitempty" json:"matchStatus,omitempty"`
	DeliveryStatus  Delivery   `firestore:"deliveryStatus,omitempty" json:"deliveryStatus,omitempty"`
	PhotoPath       string     `firestore:"photoPath,omitempty" json:"photoPath,omitempty"`
	PhotoGeneration int64      `firestore:"photoGeneration,omitempty" json:"photoGeneration,omitempty"`
	Note            string     `firestore:"note,omitempty" json:"note,omitempty"`
	IdempotencyKey  string     `firestore:"idempotencyKey" json:"-"`
	ByUID           string     `firestore:"byUid" json:"-"`
	ByRole          Role       `firestore:"byRole" json:"byRole"`

	TargetEventID string         `firestore:"targetEventId,omitempty" json:"targetEventId,omitempty"`
	Changes       map[string]any `firestore:"changes,omitempty" json:"changes,omitempty"`
	Reason        string         `firestore:"reason,omitempty" json:"reason,omitempty"`
}
