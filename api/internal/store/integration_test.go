package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func requireEmulator(t *testing.T) (*Store, context.Context) {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST is not set; run `make emulator` then `make test-integration`")
	}
	ctx := context.Background()

	projectID := "delivery-test-" + uuid.NewString()[:8]
	s, err := New(ctx, projectID, "(default)")
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	return s, ctx
}

type world struct {
	driverUID string
	shopAID   string
	shopBID   string
	routeID   string
	tripID    string
}

func seed(t *testing.T, s *Store, ctx context.Context, stops []domain.Stop) world {
	t.Helper()

	require.NoError(t, s.SetConfig(ctx, 75))

	driverUID := "driver-" + uuid.NewString()[:8]
	require.NoError(t, s.PutUser(ctx, driverUID, domain.User{
		Role: domain.RoleDriver, Name: "Sato", Email: driverUID + "@example.com", Active: true,
	}))

	radius := 50.0
	shopA, err := s.CreateShop(ctx, domain.ShopRequest{
		Name: ptr("Shop A"), Lat: nf(35.6839), Lng: nf(139.7744),
		RadiusM: domain.Nullable[float64]{Present: true, Value: &radius},
	})
	require.NoError(t, err)

	shopB, err := s.CreateShop(ctx, domain.ShopRequest{
		Name: ptr("Shop B"), Lat: nf(35.6896), Lng: nf(139.7006),
	})
	require.NoError(t, err)

	depot, err := s.CreateShop(ctx, domain.ShopRequest{
		Kind: ptrKind(domain.KindWarehouse), Name: ptr("WH"), Lat: nf(35.68), Lng: nf(139.76),
	})
	require.NoError(t, err)

	resolved := make([]domain.Stop, len(stops))
	for i, st := range stops {
		resolved[i] = st
		switch st.ShopID {
		case "A":
			resolved[i].ShopID = shopA
		case "B":
			resolved[i].ShopID = shopB
		}
	}

	routeID, err := s.CreateRoute(ctx, domain.RouteRequest{
		Name:         ptr("Route 1"),
		StartPlaceID: ptr(depot),
		EndPlaceID:   ptr(depot),
		Stops:        resolved,
	})
	require.NoError(t, err)

	tripID, err := s.AssignTrip(ctx, domain.AssignTripRequest{
		RouteID: routeID, DriverUID: driverUID, AssignedDate: "2026-09-21",
	})
	require.NoError(t, err)

	return world{driverUID: driverUID, shopAID: shopA, shopBID: shopB, routeID: routeID, tripID: tripID}
}

func ptr(s string) *string    { return &s }
func ptrF(f float64) *float64 { return &f }

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func capture(seq int, lat, lng *float64, photo string) domain.ReachedRequest {
	return domain.ReachedRequest{
		Seq: seq, Lat: lat, Lng: lng, AccuracyM: ptrF(11), SampleCount: ptrI(7),
		ClientTime: now(), DeliveryStatus: domain.DeliveryDelivered, PhotoPath: photo,
	}
}

func ptrI(i int) *int { return &i }

func appErr(t *testing.T, err error) *domain.AppError {
	t.Helper()
	var ae *domain.AppError
	require.True(t, errors.As(err, &ae), "expected an AppError, got %v", err)
	return ae
}

var shopThenHome = []domain.Stop{
	{Seq: 1, Type: domain.StopShop, ShopID: "A"},
	{Seq: 2, Type: domain.StopHome, Label: "Tanaka residence"},
}

// The full trip lifecycle against the emulator.
func TestLifecycle(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	status, nextSeq, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
	require.Equal(t, domain.TripInProgress, status)
	require.Equal(t, 1, nextSeq)

	r1, err := s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.68400), ptrF(139.77450), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err)
	require.Equal(t, domain.MatchMatched, r1.MatchStatus)
	require.NotNil(t, r1.DistanceM)
	require.InDelta(t, 14.3, *r1.DistanceM, 5)
	require.Equal(t, 2, r1.NextSeq)

	r2, err := s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(2, nil, nil, "trips/"+w.tripID+"/2.jpg"), 0)
	require.NoError(t, err)
	require.Equal(t, domain.MatchNA, r2.MatchStatus)
	require.Nil(t, r2.DistanceM, "a home stop must not record a distance")

	finalStatus, err := s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
	require.Equal(t, domain.TripCompleted, finalStatus)

	events, err := s.ListEvents(ctx, w.tripID)
	require.NoError(t, err)
	require.Len(t, events, 4, "expected START, REACHED, REACHED, COMPLETE")
	require.Equal(t, domain.EventStart, events[0].Type)
	require.Equal(t, domain.EventReached, events[1].Type)
	require.Equal(t, domain.EventReached, events[2].Type)
	require.Equal(t, domain.EventComplete, events[3].Type)

	for i := 1; i < len(events); i++ {
		require.False(t, events[i].ServerTime.Before(events[i-1].ServerTime),
			"serverTime must increase monotonically: event %d is before event %d", i, i-1)
	}

	require.Empty(t, events[0].PhotoPath, "START must not carry a photo")
	require.Empty(t, events[3].PhotoPath, "COMPLETE must not carry a photo")
	require.NotEmpty(t, events[1].PhotoPath)
	require.NotEmpty(t, events[2].PhotoPath)
}

func TestRecordingTheSameStopTwiceIsRejected(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	photo := "trips/" + w.tripID + "/1.jpg"
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(), capture(1, ptrF(35.6839), ptrF(139.7744), photo), 0)
	require.NoError(t, err)

	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(), capture(1, ptrF(35.6839), ptrF(139.7744), photo), 0)
	require.Equal(t, domain.CodeAlreadyRecorded, appErr(t, err).Code,
		"re-recording a stop that already has a REACHED event is a duplicate, not a misordering")
}

// The same tap retried must return the original result, not record a second event.
func TestIdempotentReplayReturnsTheOriginal(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	key := uuid.NewString()
	photo := "trips/" + w.tripID + "/1.jpg"
	req := capture(1, ptrF(35.68400), ptrF(139.77450), photo)

	first, err := s.Reached(ctx, w.tripID, w.driverUID, key, req, 0)
	require.NoError(t, err)

	second, err := s.Reached(ctx, w.tripID, w.driverUID, key, req, 0)
	require.NoError(t, err)

	require.Equal(t, first.EventID, second.EventID, "a replay must not create a new event")
	require.Equal(t, first.ServerTime.UTC(), second.ServerTime.UTC(), "a replay must keep the original server time")
	require.Equal(t, first.NextSeq, second.NextSeq)
	require.Equal(t, first.MatchStatus, second.MatchStatus)

	events, err := s.ListEvents(ctx, w.tripID)
	require.NoError(t, err)
	require.Len(t, events, 2, "START and one REACHED")

	trip, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)
	require.Equal(t, 2, trip.CurrentStopSeq, "a replay must not advance the trip twice")
}

func TestStopsMustBeRecordedInOrder(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, []domain.Stop{
		{Seq: 1, Type: domain.StopShop, ShopID: "A"},
		{Seq: 2, Type: domain.StopHome, Label: "Tanaka residence"},
		{Seq: 3, Type: domain.StopShop, ShopID: "B"},
	})
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(3, ptrF(35.6896), ptrF(139.7006), "trips/"+w.tripID+"/3.jpg"), 0)
	require.Equal(t, domain.CodeOutOfOrder, appErr(t, err).Code)
}

func TestCompleteIsRefusedWhileStopsRemain(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.6839), ptrF(139.7744), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err)

	_, err = s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.Equal(t, domain.CodeStopsRemaining, appErr(t, err).Code)
}

// A failed delivery still counts as recorded: the driver advances and may complete.
func TestAFailedStopStillAdvancesTheTrip(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	failed := capture(1, ptrF(35.6839), ptrF(139.7744), "trips/"+w.tripID+"/1.jpg")
	failed.DeliveryStatus = domain.DeliveryFailed
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(), failed, 0)
	require.NoError(t, err)

	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(2, nil, nil, "trips/"+w.tripID+"/2.jpg"), 0)
	require.NoError(t, err)

	_, err = s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
}

// A capture outside the radius is recorded and flagged, never rejected.
func TestAnOutOfRadiusCaptureIsFlaggedNotBlocked(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)
	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	r, err := s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.6857), ptrF(139.7744), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err, "an out-of-radius capture must still be recorded")
	require.Equal(t, domain.MatchSuspect, r.MatchStatus)
}

func TestADriverMayOnlyRunOneTripAtATime(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	second, err := s.AssignTrip(ctx, domain.AssignTripRequest{
		RouteID: w.routeID, DriverUID: w.driverUID, AssignedDate: "2026-09-21",
	})
	require.NoError(t, err)

	_, _, err = s.StartTrip(ctx, second, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.Equal(t, domain.CodeDriverBusy, appErr(t, err).Code)
}

// A retried Start on a trip this driver already started must succeed.
func TestStartIsIdempotentWhenRetried(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	status1, seq1, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	status2, seq2, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err, "a retried Start must not be rejected as TRIP_NOT_ACTIVE")
	require.Equal(t, status1, status2)
	require.Equal(t, seq1, seq2)

	events, err := s.ListEvents(ctx, w.tripID)
	require.NoError(t, err)
	var starts int
	for _, e := range events {
		if e.Type == domain.EventStart {
			starts++
		}
	}
	require.Equal(t, 1, starts, "the retry must not append a second START event")
}

// The same, for Complete.
func TestCompleteIsIdempotentWhenRetried(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.68400), ptrF(139.77450), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err)
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(2, nil, nil, "trips/"+w.tripID+"/2.jpg"), 0)
	require.NoError(t, err)

	first, err := s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	second, err := s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err, "a retried Complete must not be rejected")
	require.Equal(t, first, second)

	events, err := s.ListEvents(ctx, w.tripID)
	require.NoError(t, err)
	var completes int
	for _, e := range events {
		if e.Type == domain.EventComplete {
			completes++
		}
	}
	require.Equal(t, 1, completes, "the retry must not append a second COMPLETE event")
}

// Completing a trip must release the per-driver lock, or the driver could never run their second trip of the day.
func TestCompletingATripFreesTheDriverForTheNextOne(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.68400), ptrF(139.77450), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err)
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(2, nil, nil, "trips/"+w.tripID+"/2.jpg"), 0)
	require.NoError(t, err)
	_, err = s.CompleteTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	second, err := s.AssignTrip(ctx, domain.AssignTripRequest{
		RouteID: w.routeID, DriverUID: w.driverUID, AssignedDate: "2026-09-21",
	})
	require.NoError(t, err)

	_, _, err = s.StartTrip(ctx, second, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err, "the lock must be released on completion")
}

// The bucket is versioned, so a re-upload to the same path keeps the old bytes.
func TestTheEventPinsThePhotoGeneration(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, _, err := s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)

	const generation int64 = 1700000000000001
	_, err = s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.68400), ptrF(139.77450), "trips/"+w.tripID+"/1.jpg"), generation)
	require.NoError(t, err)

	events, err := s.ListEvents(ctx, w.tripID)
	require.NoError(t, err)

	var reached *domain.Event
	for i := range events {
		if events[i].Type == domain.EventReached {
			reached = &events[i]
		}
	}
	require.NotNil(t, reached, "no REACHED event was written")
	require.Equal(t, generation, reached.PhotoGeneration,
		"the event must pin which version of the photo it was recorded against")
}

func TestATripBelongsToItsOwnDriver(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, _, err := s.StartTrip(ctx, w.tripID, "someone-else", domain.BaseCapture{ClientTime: now()})
	require.Equal(t, domain.CodeForbidden, appErr(t, err).Code)
}

func TestAStopCannotBeRecordedBeforeTheTripStarts(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	_, err := s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.6839), ptrF(139.7744), "trips/"+w.tripID+"/1.jpg"), 0)
	require.Equal(t, domain.CodeTripNotActive, appErr(t, err).Code)
}

// The point of the snapshot: an admin editing a shop must not change how an already-assigned trip is judged.
func TestEditingAShopDoesNotChangeAnAssignedTrip(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	before, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)
	frozen := before.RouteSnapshot.Stops[0]
	require.Equal(t, 50.0, frozen.ExpectedRadiusM, "shop A's own radius should be frozen in")

	require.NoError(t, s.UpdateShop(ctx, w.shopAID, domain.ShopRequest{
		Lat: nf(35.0), Lng: nf(139.0),
		RadiusM: domain.Nullable[float64]{Present: true, Value: ptrF(1000)},
	}))
	require.NoError(t, s.SetConfig(ctx, 500))

	after, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)
	require.Equal(t, frozen.ExpectedLat, after.RouteSnapshot.Stops[0].ExpectedLat)
	require.Equal(t, frozen.ExpectedLng, after.RouteSnapshot.Stops[0].ExpectedLng)
	require.Equal(t, frozen.ExpectedRadiusM, after.RouteSnapshot.Stops[0].ExpectedRadiusM)

	_, _, err = s.StartTrip(ctx, w.tripID, w.driverUID, domain.BaseCapture{ClientTime: now()})
	require.NoError(t, err)
	r, err := s.Reached(ctx, w.tripID, w.driverUID, uuid.NewString(),
		capture(1, ptrF(35.68400), ptrF(139.77450), "trips/"+w.tripID+"/1.jpg"), 0)
	require.NoError(t, err)
	require.Equal(t, domain.MatchMatched, r.MatchStatus,
		"judged against the snapshot, the original capture is still a match")
}

// A trip assigned before the global radius changed keeps the old fallback.
func TestTheGlobalRadiusIsFrozenPerTrip(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, []domain.Stop{{Seq: 1, Type: domain.StopShop, ShopID: "B"}})

	trip, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)
	require.Equal(t, 75.0, trip.RouteSnapshot.Stops[0].ExpectedRadiusM,
		"shop B has no override, so it should have frozen the 75 m global radius")

	require.NoError(t, s.SetConfig(ctx, 300))

	again, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)
	require.Equal(t, 75.0, again.RouteSnapshot.Stops[0].ExpectedRadiusM)
}

func TestNextStopWithholdsEverythingButTheCurrentStop(t *testing.T) {
	s, ctx := requireEmulator(t)
	w := seed(t, s, ctx, shopThenHome)

	trip, err := s.GetTrip(ctx, w.tripID)
	require.NoError(t, err)

	next := trip.NextStop()
	require.False(t, next.Done)
	require.Equal(t, 1, next.Seq)
	require.Equal(t, domain.StopShop, next.Type)
	require.Equal(t, "Shop A", next.ShopName)
	require.NotNil(t, next.ExpectedRadiusM)

	trip.CurrentStopSeq = len(trip.RouteSnapshot.Stops) + 1
	require.True(t, trip.NextStop().Done, fmt.Sprintf("after the last stop, next should be done"))
}

// Listing users, filtered by role.
func TestListUsersFiltersByRoleAndKeepsNameOrder(t *testing.T) {
	s, ctx := requireEmulator(t)

	require.NoError(t, s.PutUser(ctx, "u-super", domain.User{Role: domain.RoleSuperadmin, Name: "Aoki", Email: "a@example.com", Active: true}))
	require.NoError(t, s.PutUser(ctx, "u-admin", domain.User{Role: domain.RoleAdmin, Name: "Mori", Email: "m@example.com", Active: true}))
	require.NoError(t, s.PutUser(ctx, "u-d2", domain.User{Role: domain.RoleDriver, Name: "Yamada", Email: "y@example.com", Active: true}))
	require.NoError(t, s.PutUser(ctx, "u-d1", domain.User{Role: domain.RoleDriver, Name: "Sato", Email: "s@example.com", Active: true}))

	all, err := s.ListUsers(ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 4)
	require.Equal(t, []string{"Aoki", "Mori", "Sato", "Yamada"}, names(all))

	drivers, err := s.ListUsers(ctx, domain.RoleDriver)
	require.NoError(t, err)
	require.Equal(t, []string{"Sato", "Yamada"}, names(drivers))
	require.Equal(t, "u-d1", drivers[0].UID)

	admins, err := s.ListUsers(ctx, domain.RoleAdmin)
	require.NoError(t, err)
	require.Equal(t, []string{"Mori"}, names(admins))

	none, err := s.ListUsers(ctx, domain.Role("manager"))
	require.NoError(t, err)
	require.NotNil(t, none, "an empty result must encode as [] and not null")
	require.Empty(t, none)
}

func names(users []domain.User) []string {
	out := make([]string, 0, len(users))
	for _, u := range users {
		out = append(out, u.Name)
	}
	return out
}

func ptrKind(k domain.LocationKind) *domain.LocationKind { return &k }

func nf(v float64) domain.Nullable[float64] {
	return domain.Nullable[float64]{Present: true, Value: &v}
}
