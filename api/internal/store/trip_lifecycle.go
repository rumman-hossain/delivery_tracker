package store

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// StartTrip moves a trip to in_progress and appends the START event.
func (s *Store) StartTrip(ctx context.Context, tripID, driverUID string, cap domain.BaseCapture) (domain.TripStatus, int, error) {
	clientTime, appErr := domain.ParseClientTime(cap.ClientTime)
	if appErr != nil {
		return "", 0, appErr
	}

	tripRef := s.c.Collection(colTrips).Doc(tripID)
	userRef := s.c.Collection(colUsers).Doc(driverUID)
	events := tripRef.Collection(colEvents)
	startKey := "start:" + tripID
	var nextSeq int

	err := s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		nextSeq = 0

		snap, err := tx.Get(tripRef)
		if err != nil {
			return notFound(err, "that trip")
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return err
		}
		if trip.DriverUID != driverUID {
			return domain.Forbidden("that trip belongs to another driver")
		}

		if trip.Status == domain.TripInProgress {
			prior, err := tx.Documents(events.Where("idempotencyKey", "==", startKey).Limit(1)).GetAll()
			if err != nil {
				return err
			}
			if len(prior) > 0 {
				nextSeq = trip.CurrentStopSeq
				return nil
			}
		}

		if trip.Status != domain.TripAssigned {
			return domain.Conflict(domain.CodeTripNotActive, "that trip has already been started")
		}

		userSnap, err := tx.Get(userRef)
		if err != nil {
			return notFound(err, "your user record")
		}
		var user domain.User
		if err := userSnap.DataTo(&user); err != nil {
			return err
		}
		if user.ActiveTripID != "" && user.ActiveTripID != tripID {
			return domain.Conflict(domain.CodeDriverBusy, "finish your trip in progress before starting another")
		}

		serverTime := time.Now().UTC()
		skew := serverTime.Sub(clientTime).Milliseconds()

		ev := domain.Event{
			Type:           domain.EventStart,
			ServerTime:     serverTime,
			ClientTime:     &clientTime,
			TimeSkewMs:     &skew,
			Lat:            cap.Lat,
			Lng:            cap.Lng,
			AccuracyM:      cap.AccuracyM,
			ByUID:          driverUID,
			ByRole:         domain.RoleDriver,
			IdempotencyKey: startKey,
		}
		if err := tx.Create(events.NewDoc(), ev); err != nil {
			return err
		}

		if err := tx.Update(userRef, []firestore.Update{
			{Path: "activeTripId", Value: tripID},
		}); err != nil {
			return err
		}

		nextSeq = trip.CurrentStopSeq
		return tx.Update(tripRef, []firestore.Update{
			{Path: "status", Value: string(domain.TripInProgress)},
			{Path: "startedAt", Value: serverTime},
		})
	})
	if err != nil {
		return "", 0, err
	}
	return domain.TripInProgress, nextSeq, nil
}

// CompleteTrip closes a trip, but only once every stop has been recorded.
func (s *Store) CompleteTrip(ctx context.Context, tripID, driverUID string, cap domain.BaseCapture) (domain.TripStatus, error) {
	clientTime, appErr := domain.ParseClientTime(cap.ClientTime)
	if appErr != nil {
		return "", appErr
	}

	tripRef := s.c.Collection(colTrips).Doc(tripID)
	userRef := s.c.Collection(colUsers).Doc(driverUID)
	events := tripRef.Collection(colEvents)
	completeKey := "complete:" + tripID

	err := s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(tripRef)
		if err != nil {
			return notFound(err, "that trip")
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return err
		}
		if trip.DriverUID != driverUID {
			return domain.Forbidden("that trip belongs to another driver")
		}

		if trip.Status == domain.TripCompleted {
			prior, err := tx.Documents(events.Where("idempotencyKey", "==", completeKey).Limit(1)).GetAll()
			if err != nil {
				return err
			}
			if len(prior) > 0 {
				return nil
			}
		}

		if trip.Status != domain.TripInProgress {
			return domain.Conflict(domain.CodeTripNotActive, "that trip is not in progress")
		}
		if remaining := len(trip.RouteSnapshot.Stops) - (trip.CurrentStopSeq - 1); remaining > 0 {
			return domain.Conflict(domain.CodeStopsRemaining,
				fmt.Sprintf("%d stop(s) still need recording before you can complete this trip", remaining))
		}

		_, err = tx.Get(userRef)
		if err != nil && !isNotFound(err) {
			return err
		}
		releaseLock := err == nil

		serverTime := time.Now().UTC()
		skew := serverTime.Sub(clientTime).Milliseconds()

		ev := domain.Event{
			Type:           domain.EventComplete,
			ServerTime:     serverTime,
			ClientTime:     &clientTime,
			TimeSkewMs:     &skew,
			Lat:            cap.Lat,
			Lng:            cap.Lng,
			AccuracyM:      cap.AccuracyM,
			ByUID:          driverUID,
			ByRole:         domain.RoleDriver,
			IdempotencyKey: completeKey,
		}
		if err := tx.Create(events.NewDoc(), ev); err != nil {
			return err
		}

		if releaseLock {
			if err := tx.Update(userRef, []firestore.Update{
				{Path: "activeTripId", Value: ""},
			}); err != nil {
				return err
			}
		}

		return tx.Update(tripRef, []firestore.Update{
			{Path: "status", Value: string(domain.TripCompleted)},
			{Path: "completedAt", Value: serverTime},
		})
	})
	if err != nil {
		return "", err
	}
	return domain.TripCompleted, nil
}
