package domain

import (
	"encoding/json"
	"strings"
	"testing"
)

func f(v float64) *float64 { return &v }

func nf(v float64) Nullable[float64] { return Nullable[float64]{Present: true, Value: &v} }
func s(v string) *string             { return &v }

var (
	shopStop = SnapshotStop{Seq: 2, Type: StopShop, ShopName: "Shop A",
		ExpectedLat: f(35.6839), ExpectedLng: f(139.7744), ExpectedRadiusM: f(50)}
	homeStop = SnapshotStop{Seq: 2, Type: StopHome, Label: "Tanaka residence"}
)

func validShopCapture() ReachedRequest {
	return ReachedRequest{
		Seq: 2, Lat: f(35.6839), Lng: f(139.7744), AccuracyM: f(12.4),
		SampleCount: intp(8), ClientTime: "2026-09-21T10:41:07.123Z",
		DeliveryStatus: DeliveryDelivered, PhotoPath: "trips/t1/2.jpg",
	}
}

func intp(v int) *int { return &v }

func TestValidateReached(t *testing.T) {
	cases := []struct {
		name     string
		mutate   func(*ReachedRequest)
		stop     SnapshotStop
		wantCode Code
	}{
		{"a complete shop capture is accepted", nil, shopStop, ""},
		{"a home capture with a position is accepted",
			func(r *ReachedRequest) { r.PhotoPath = "" }, homeStop, ""},
		{"a failed delivery is still recorded",
			func(r *ReachedRequest) { r.DeliveryStatus = DeliveryFailed }, shopStop, ""},

		{"a shop capture without a photo is rejected",
			func(r *ReachedRequest) { r.PhotoPath = "" }, shopStop, CodeBadRequest},
		{"a home capture without a position is rejected",
			func(r *ReachedRequest) { r.Lat, r.Lng = nil, nil }, homeStop, CodeBadRequest},
		{"a blank photoPath is not a photo",
			func(r *ReachedRequest) { r.PhotoPath = "   " }, shopStop, CodeBadRequest},

		{"a shop capture without GPS is rejected",
			func(r *ReachedRequest) { r.Lat, r.Lng = nil, nil }, shopStop, CodeBadRequest},
		{"an out-of-range latitude is rejected",
			func(r *ReachedRequest) { r.Lat = f(91) }, shopStop, CodeBadRequest},
		{"an unknown deliveryStatus is rejected",
			func(r *ReachedRequest) { r.DeliveryStatus = "lost" }, shopStop, CodeBadRequest},
		{"an empty deliveryStatus is rejected",
			func(r *ReachedRequest) { r.DeliveryStatus = "" }, shopStop, CodeBadRequest},
		{"a seq that does not match the stop is rejected",
			func(r *ReachedRequest) { r.Seq = 3 }, shopStop, CodeBadRequest},
		{"a non-positive seq is rejected",
			func(r *ReachedRequest) { r.Seq = 0 }, shopStop, CodeBadRequest},
		{"a missing clientTime is rejected",
			func(r *ReachedRequest) { r.ClientTime = "" }, shopStop, CodeBadRequest},
		{"an unparseable clientTime is rejected",
			func(r *ReachedRequest) { r.ClientTime = "21/09/2026" }, shopStop, CodeBadRequest},
		{"a negative accuracy is rejected",
			func(r *ReachedRequest) { r.AccuracyM = f(-1) }, shopStop, CodeBadRequest},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := validShopCapture()
			if c.mutate != nil {
				c.mutate(&req)
			}
			err := ValidateReached(req, c.stop)
			assertCode(t, err, c.wantCode)
		})
	}
}

// A home stop: position required, photo optional.
func TestHomeStopRequiresPositionNotPhoto(t *testing.T) {
	base := ReachedRequest{
		Seq: 2, Lat: f(35.6839), Lng: f(139.7744),
		ClientTime: "2026-09-21T10:41:07.123Z", DeliveryStatus: DeliveryDelivered,
	}

	t.Run("a position and no photo is the normal case", func(t *testing.T) {
		assertCode(t, ValidateReached(base, homeStop), "")
	})

	t.Run("a photo is still accepted when the driver took one", func(t *testing.T) {
		req := base
		req.PhotoPath = "trips/t1/2.jpg"
		assertCode(t, ValidateReached(req, homeStop), "")
	})

	t.Run("no position is refused", func(t *testing.T) {
		req := base
		req.Lat, req.Lng = nil, nil
		assertCode(t, ValidateReached(req, homeStop), CodeBadRequest)
	})

	t.Run("half a position is refused", func(t *testing.T) {
		req := base
		req.Lng = nil
		assertCode(t, ValidateReached(req, homeStop), CodeBadRequest)
	})

	t.Run("an impossible position is refused", func(t *testing.T) {
		req := base
		req.Lat = f(999)
		assertCode(t, ValidateReached(req, homeStop), CodeBadRequest)
	})

	t.Run("a shop stop still demands its photo", func(t *testing.T) {
		req := base
		req.Seq = 1
		assertCode(t, ValidateReached(req, shopStop), CodeBadRequest)
	})
}

func TestValidateBaseCapture(t *testing.T) {
	cases := []struct {
		name     string
		in       BaseCapture
		wantCode Code
	}{
		{"START with a fix", BaseCapture{Lat: f(35.68), Lng: f(139.76), AccuracyM: f(9), ClientTime: "2026-09-21T10:00:00Z"}, ""},
		{"START with no fix at all is fine — GPS here is best-effort", BaseCapture{ClientTime: "2026-09-21T10:00:00Z"}, ""},
		{"a lone latitude is rejected", BaseCapture{Lat: f(35.68), ClientTime: "2026-09-21T10:00:00Z"}, CodeBadRequest},
		{"an out-of-range longitude is rejected", BaseCapture{Lat: f(35.68), Lng: f(181), ClientTime: "2026-09-21T10:00:00Z"}, CodeBadRequest},
		{"a missing clientTime is rejected", BaseCapture{}, CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { assertCode(t, ValidateBaseCapture(c.in), c.wantCode) })
	}
}

func TestValidateShop(t *testing.T) {
	cases := []struct {
		name     string
		in       ShopRequest
		create   bool
		wantCode Code
	}{
		{"create with the minimum fields", ShopRequest{Name: s("Shop A"), Lat: nf(35.68), Lng: nf(139.77)}, true, ""},
		{"create without a name is rejected", ShopRequest{Lat: nf(35.68), Lng: nf(139.77)}, true, CodeBadRequest},
		{"create without coordinates is rejected", ShopRequest{Name: s("Shop A")}, true, CodeBadRequest},
		{"patching only the name is fine", ShopRequest{Name: s("Renamed")}, false, ""},
		{"a blank name is rejected", ShopRequest{Name: s("  ")}, false, CodeBadRequest},
		{"a lone longitude is rejected", ShopRequest{Lng: nf(139.77)}, false, CodeBadRequest},
		{"a radius below the minimum is rejected",
			ShopRequest{RadiusM: Nullable[float64]{Present: true, Value: f(9)}}, false, CodeBadRequest},
		{"a radius above the maximum is rejected",
			ShopRequest{RadiusM: Nullable[float64]{Present: true, Value: f(1001)}}, false, CodeBadRequest},
		{"a fractional radius is rejected",
			ShopRequest{RadiusM: Nullable[float64]{Present: true, Value: f(50.5)}}, false, CodeBadRequest},
		{"a radius at the boundary is accepted",
			ShopRequest{RadiusM: Nullable[float64]{Present: true, Value: f(10)}}, false, ""},
		{"an explicit null radius clears the override",
			ShopRequest{RadiusM: Nullable[float64]{Present: true, Value: nil}}, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { assertCode(t, ValidateShop(c.in, c.create), c.wantCode) })
	}
}

// A PATCH must be able to tell "leave radiusM alone" apart from "clear it".
func TestNullableDistinguishesAbsentFromNull(t *testing.T) {
	var absent, null, set ShopRequest
	mustUnmarshal(t, `{"name":"A"}`, &absent)
	mustUnmarshal(t, `{"radiusM":null}`, &null)
	mustUnmarshal(t, `{"radiusM":50}`, &set)

	if absent.RadiusM.Present {
		t.Error("an omitted radiusM must not be Present")
	}
	if !null.RadiusM.Present || null.RadiusM.Value != nil {
		t.Errorf("an explicit null must be Present with a nil Value; got Present=%v Value=%v",
			null.RadiusM.Present, null.RadiusM.Value)
	}
	if !set.RadiusM.Present || set.RadiusM.Value == nil || *set.RadiusM.Value != 50 {
		t.Errorf("a value must survive round-tripping; got Present=%v Value=%v",
			set.RadiusM.Present, set.RadiusM.Value)
	}
}

func TestValidateConfig(t *testing.T) {
	cases := []struct {
		name     string
		in       ConfigRequest
		wantCode Code
	}{
		{"the documented default", ConfigRequest{MatchRadiusM: f(75)}, ""},
		{"a missing radius is rejected", ConfigRequest{}, CodeBadRequest},
		{"below the minimum is rejected", ConfigRequest{MatchRadiusM: f(9)}, CodeBadRequest},
		{"above the maximum is rejected", ConfigRequest{MatchRadiusM: f(1001)}, CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { assertCode(t, ValidateConfig(c.in), c.wantCode) })
	}
}

func TestValidateRoute(t *testing.T) {
	base := s("w1")
	good := []Stop{
		{Seq: 1, Type: StopShop, ShopID: "s1"},
		{Seq: 2, Type: StopHome, Label: "Tanaka residence"},
		{Seq: 3, Type: StopShop, ShopID: "s2"},
	}
	cases := []struct {
		name     string
		in       RouteRequest
		create   bool
		wantCode Code
	}{
		{"a three-stop shop/home/shop route", RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: good}, true, ""},
		{"create without stops is rejected", RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base}, true, CodeBadRequest},
		{"an empty stop list is rejected", RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: []Stop{}}, true, CodeBadRequest},
		{"non-contiguous seq values are rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: []Stop{{Seq: 1, Type: StopShop, ShopID: "s1"}, {Seq: 3, Type: StopShop, ShopID: "s2"}}}, true, CodeBadRequest},
		{"a shop stop without a shopId is rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: []Stop{{Seq: 1, Type: StopShop}}}, true, CodeBadRequest},
		{"a home stop without a label is rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: []Stop{{Seq: 1, Type: StopHome}}}, true, CodeBadRequest},
		{"an unknown stop type is rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: base, Stops: []Stop{{Seq: 1, Type: "depot"}}}, true, CodeBadRequest},
		{"create without a start place is rejected", RouteRequest{Name: s("R1"), EndPlaceID: base, Stops: good}, true, CodeBadRequest},
		{"create without an end place is rejected", RouteRequest{Name: s("R1"), StartPlaceID: base, Stops: good}, true, CodeBadRequest},
		{"a blank start place is rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: s("  "), EndPlaceID: base, Stops: good}, true, CodeBadRequest},
		{"a blank end place is rejected",
			RouteRequest{Name: s("R1"), StartPlaceID: base, EndPlaceID: s("  "), Stops: good}, true, CodeBadRequest},
		{"patching only the name is fine", RouteRequest{Name: s("Renamed")}, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { assertCode(t, ValidateRoute(c.in, c.create), c.wantCode) })
	}
}

func TestValidateAssignTrip(t *testing.T) {
	cases := []struct {
		name     string
		in       AssignTripRequest
		wantCode Code
	}{
		{"a well-formed assignment", AssignTripRequest{RouteID: "r1", DriverUID: "u1", AssignedDate: "2026-09-21"}, ""},
		{"a missing routeId is rejected", AssignTripRequest{DriverUID: "u1", AssignedDate: "2026-09-21"}, CodeBadRequest},
		{"a missing driverUid is rejected", AssignTripRequest{RouteID: "r1", AssignedDate: "2026-09-21"}, CodeBadRequest},
		{"a non-ISO date is rejected", AssignTripRequest{RouteID: "r1", DriverUID: "u1", AssignedDate: "21/09/2026"}, CodeBadRequest},
		{"an impossible date is rejected", AssignTripRequest{RouteID: "r1", DriverUID: "u1", AssignedDate: "2026-02-31"}, CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { assertCode(t, ValidateAssignTrip(c.in), c.wantCode) })
	}
}

func TestValidateCreateUser(t *testing.T) {
	ok := CreateUserRequest{Name: "Sato", Email: "sato@example.com", Phone: "090-1234-5678", TempPassword: "temp1234", Role: RoleDriver}
	cases := []struct {
		name     string
		mutate   func(*CreateUserRequest)
		wantCode Code
	}{
		{"a well-formed driver", nil, ""},
		{"a missing name is rejected", func(r *CreateUserRequest) { r.Name = "" }, CodeBadRequest},
		{"a malformed email is rejected", func(r *CreateUserRequest) { r.Email = "sato" }, CodeBadRequest},
		{"a bare @ is rejected", func(r *CreateUserRequest) { r.Email = "@" }, CodeBadRequest},
		{"an address with no domain is rejected", func(r *CreateUserRequest) { r.Email = "sato@" }, CodeBadRequest},
		{"the display-name form is rejected", func(r *CreateUserRequest) { r.Email = "Sato <sato@example.com>" }, CodeBadRequest},
		{"a short password is rejected", func(r *CreateUserRequest) { r.TempPassword = "short" }, CodeBadRequest},
		{"an unknown role is rejected", func(r *CreateUserRequest) { r.Role = "manager" }, CodeBadRequest},

		{"a missing phone is rejected", func(r *CreateUserRequest) { r.Phone = "" }, CodeBadRequest},
		{"a blank phone is rejected", func(r *CreateUserRequest) { r.Phone = "   " }, CodeBadRequest},
		{"too few digits is rejected", func(r *CreateUserRequest) { r.Phone = "090-12" }, CodeBadRequest},
		{"letters are rejected", func(r *CreateUserRequest) { r.Phone = "call me maybe" }, CodeBadRequest},
		{"an international number is accepted", func(r *CreateUserRequest) { r.Phone = "+81 90 1234 5678" }, ""},
		{"a bracketed number is accepted", func(r *CreateUserRequest) { r.Phone = "(090) 1234.5678" }, ""},
		{"superadmin is a well-formed role", func(r *CreateUserRequest) { r.Role = RoleSuperadmin }, ""},
		{"admin is a well-formed role", func(r *CreateUserRequest) { r.Role = RoleAdmin }, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := ok
			if c.mutate != nil {
				c.mutate(&req)
			}
			assertCode(t, ValidateCreateUser(req), c.wantCode)
		})
	}
}

// Every rejection must carry the HTTP status the frontend expects for its code.
func TestErrorStatusMapping(t *testing.T) {
	cases := []struct {
		err        *AppError
		wantCode   Code
		wantStatus int
	}{
		{BadRequest("x"), CodeBadRequest, 400},
		{Unauthenticated("x"), CodeUnauthenticated, 401},
		{Forbidden("x"), CodeForbidden, 403},
		{NotFound("x"), CodeNotFound, 404},
		{Internal("x"), CodeInternal, 500},
		{Conflict(CodeTripNotActive, "x"), CodeTripNotActive, 409},
		{Conflict(CodeDriverBusy, "x"), CodeDriverBusy, 409},
		{Conflict(CodeOutOfOrder, "x"), CodeOutOfOrder, 409},
		{Conflict(CodeAlreadyRecorded, "x"), CodeAlreadyRecorded, 409},
		{Conflict(CodeStopsRemaining, "x"), CodeStopsRemaining, 409},
	}
	for _, c := range cases {
		t.Run(string(c.wantCode), func(t *testing.T) {
			if c.err.Code != c.wantCode || c.err.HTTPStatus != c.wantStatus {
				t.Errorf("got %q/%d, want %q/%d", c.err.Code, c.err.HTTPStatus, c.wantCode, c.wantStatus)
			}
		})
	}
}

func assertCode(t *testing.T, err *AppError, want Code) {
	t.Helper()
	switch {
	case want == "" && err != nil:
		t.Fatalf("expected the request to be accepted, got %q: %s", err.Code, err.Message)
	case want != "" && err == nil:
		t.Fatalf("expected %q, got no error", want)
	case want != "" && err.Code != want:
		t.Fatalf("expected %q, got %q: %s", want, err.Code, err.Message)
	}
}

func mustUnmarshal(t *testing.T, raw string, into any) {
	t.Helper()
	if err := json.Unmarshal([]byte(raw), into); err != nil {
		t.Fatalf("unmarshal %s: %v", raw, err)
	}
}

// The driver's own account of a stop.
func TestValidateReachedNote(t *testing.T) {
	base := func(note string) ReachedRequest {
		lat, lng := 35.7, 139.7
		return ReachedRequest{
			Seq: 1, Lat: &lat, Lng: &lng, ClientTime: "2026-09-22T01:00:00.000Z",
			DeliveryStatus: DeliveryDelivered, PhotoPath: "trips/t1/1.jpg", Note: note,
		}
	}
	stop := SnapshotStop{Seq: 1, Type: StopShop, ExpectedLat: f(35.7), ExpectedLng: f(139.7), ExpectedRadiusM: f(50)}

	cases := []struct {
		name     string
		note     string
		wantCode Code
	}{
		{"no note at all is fine", "", ""},
		{"a sentence is fine", "Delivered to the loading bay at the back.", ""},
		{"exactly the limit is accepted", strings.Repeat("a", MaxNoteRunes), ""},
		{"one over is refused", strings.Repeat("a", MaxNoteRunes+1), CodeBadRequest},
		{"a full-width note is measured in characters", strings.Repeat("配", MaxNoteRunes), ""},
		{"one full-width character over is refused", strings.Repeat("配", MaxNoteRunes+1), CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertCode(t, ValidateReached(base(c.note), stop), c.wantCode)
		})
	}
}

// A chain calls at each place once.
func TestValidateRouteRefusesTheSamePlaceTwice(t *testing.T) {
	id, start, end := "r", "w1", "w1"
	route := func(stops ...Stop) RouteRequest {
		name := id
		return RouteRequest{Name: &name, StartPlaceID: &start, EndPlaceID: &end, Stops: stops}
	}
	shop := func(seq int, shopID string) Stop {
		return Stop{Seq: seq, Type: StopShop, ShopID: shopID}
	}

	t.Run("two different shops are fine", func(t *testing.T) {
		assertCode(t, ValidateRoute(route(shop(1, "s1"), shop(2, "s2")), true), "")
	})

	t.Run("the same shop twice is refused", func(t *testing.T) {
		assertCode(t, ValidateRoute(route(shop(1, "s1"), shop(2, "s1")), true), CodeBadRequest)
	})

	t.Run("the same shop apart in the chain is still refused", func(t *testing.T) {
		assertCode(t, ValidateRoute(route(shop(1, "s1"), shop(2, "s2"), shop(3, "s1")), true), CodeBadRequest)
	})

	t.Run("two home stops with the same label are allowed", func(t *testing.T) {
		home := func(seq int) Stop { return Stop{Seq: seq, Type: StopHome, Label: "the flats on Sakura-dori"} }
		assertCode(t, ValidateRoute(route(home(1), home(2)), true), "")
	})

	t.Run("editing a live trip is held to the same rule", func(t *testing.T) {
		req := EditTripStopsRequest{Reason: "shuffling the afternoon", Stops: []Stop{shop(1, "s1"), shop(2, "s1")}}
		assertCode(t, ValidateEditTripStops(req), CodeBadRequest)
	})
}

// A home delivery is a place with no position, and that is allowed.
func TestValidateShopHomeKind(t *testing.T) {
	home, shop, warehouse := KindHome, KindShop, KindWarehouse
	name := "Tanaka-san, 3F"

	t.Run("a home delivery needs no position", func(t *testing.T) {
		assertCode(t, ValidateShop(ShopRequest{Kind: &home, Name: &name}, true), "")
	})

	t.Run("a home delivery may still have one", func(t *testing.T) {
		req := ShopRequest{Kind: &home, Name: &name, Lat: nf(35.7), Lng: nf(139.7)}
		assertCode(t, ValidateShop(req, true), "")
	})

	t.Run("a shop still needs one", func(t *testing.T) {
		assertCode(t, ValidateShop(ShopRequest{Kind: &shop, Name: &name}, true), CodeBadRequest)
	})

	t.Run("a warehouse still needs one", func(t *testing.T) {
		assertCode(t, ValidateShop(ShopRequest{Kind: &warehouse, Name: &name}, true), CodeBadRequest)
	})

	t.Run("an unset kind still needs one", func(t *testing.T) {
		assertCode(t, ValidateShop(ShopRequest{Name: &name}, true), CodeBadRequest)
	})

	t.Run("a nonsense kind is refused", func(t *testing.T) {
		odd := LocationKind("depot")
		assertCode(t, ValidateShop(ShopRequest{Kind: &odd, Name: &name, Lat: nf(35.7), Lng: nf(139.7)}, true), CodeBadRequest)
	})

	t.Run("a home delivery with half a position is refused", func(t *testing.T) {
		assertCode(t, ValidateShop(ShopRequest{Kind: &home, Name: &name, Lat: nf(35.7)}, true), CodeBadRequest)
	})
}
