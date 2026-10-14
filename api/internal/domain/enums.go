package domain

const (
	DefaultMatchRadiusM = 75.0
	MinRadiusM          = 10.0
	MaxRadiusM          = 1000.0

	MinPasswordLength = 8
)

type Role string

const (
	RoleSuperadmin Role = "superadmin"
	RoleAdmin      Role = "admin"
	RoleDriver     Role = "driver"
)

// LocationKind separates the places a route can call at.
type LocationKind string

const (
	KindShop      LocationKind = "shop"
	KindWarehouse LocationKind = "warehouse"
	KindHome      LocationKind = "home"
)

type StopType string

const (
	StopShop StopType = "shop"
	StopHome StopType = "home"
)

type TripStatus string

const (
	TripAssigned   TripStatus = "assigned"
	TripInProgress TripStatus = "in_progress"
	TripCompleted  TripStatus = "completed"
)

type EventType string

const (
	EventStart        EventType = "START"
	EventReached      EventType = "REACHED"
	EventComplete     EventType = "COMPLETE"
	EventCorrection   EventType = "CORRECTION"
	EventRouteChanged EventType = "ROUTE_CHANGED"
)

// Match is the verdict on how close a capture landed to its expected shop.
type Match string

const (
	MatchMatched Match = "matched"
	MatchSuspect Match = "suspect"
	MatchNA      Match = "na"
)

type Delivery string

const (
	DeliveryDelivered Delivery = "delivered"
	DeliveryPartial   Delivery = "partial"
	DeliveryFailed    Delivery = "failed"
)
