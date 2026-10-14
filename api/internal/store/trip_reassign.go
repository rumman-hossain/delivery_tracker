package store

import (
	"context"

	"cloud.google.com/go/firestore"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// ReassignTrip hands a trip to a different driver.
func (s *Store) ReassignTrip(ctx context.Context, tripID string, driver domain.User) (domain.Trip, error) {
	ref := s.c.Collection(colTrips).Doc(tripID)
	var out domain.Trip

	err := s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			return notFound(err, "that trip")
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return err
		}

		if trip.Status != domain.TripAssigned {
			return domain.Conflict(domain.CodeTripNotActive,
				"this trip has already started, so it cannot be handed to another driver")
		}
		if trip.DriverUID == driver.UID {
			out = trip
			return nil
		}

		if err := tx.Update(ref, []firestore.Update{
			{Path: "driverUid", Value: driver.UID},
			{Path: "driverName", Value: driver.Name},
		}); err != nil {
			return err
		}

		trip.DriverUID = driver.UID
		trip.DriverName = driver.Name
		out = trip
		return nil
	})

	return out, err
}
