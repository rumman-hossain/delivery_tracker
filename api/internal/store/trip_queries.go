package store

import (
	"context"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func (s *Store) GetTrip(ctx context.Context, id string) (domain.Trip, error) {
	snap, err := s.c.Collection(colTrips).Doc(id).Get(ctx)
	if err != nil {
		return domain.Trip{}, notFound(err, "that trip")
	}
	return tripFrom(snap)
}

func tripFrom(snap *firestore.DocumentSnapshot) (domain.Trip, error) {
	var t domain.Trip
	if err := snap.DataTo(&t); err != nil {
		return domain.Trip{}, err
	}
	t.ID = snap.Ref.ID
	return t, nil
}

// MaxListSize caps how many documents a list query will read.
const MaxListSize = 500

// TripFilters mirrors the admin list query string.
type TripFilters struct {
	DriverUID string
	Date      string
	Status    domain.TripStatus
}

// ListTripsInDateRange returns every trip assigned within an inclusive calendar-day range, oldest day first.
func (s *Store) ListTripsInDateRange(ctx context.Context, from, to string) ([]domain.Trip, error) {
	it := s.c.Collection(colTrips).
		Where("assignedDate", ">=", from).
		Where("assignedDate", "<=", to).
		OrderBy("assignedDate", firestore.Asc).
		OrderBy("createdAt", firestore.Desc).
		Documents(ctx)
	defer it.Stop()

	trips := []domain.Trip{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return trips, nil
		}
		if err != nil {
			return nil, err
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return nil, err
		}
		trips = append(trips, trip)
	}
}

func (s *Store) ListTrips(ctx context.Context, f TripFilters) ([]domain.Trip, bool, error) {
	q := s.c.Collection(colTrips).Query
	if f.DriverUID != "" {
		q = q.Where("driverUid", "==", f.DriverUID)
	}
	if f.Date != "" {
		q = q.Where("assignedDate", "==", f.Date)
	}
	if f.Status != "" {
		q = q.Where("status", "==", string(f.Status))
	}

	it := q.OrderBy("createdAt", firestore.Desc).Limit(MaxListSize + 1).Documents(ctx)
	defer it.Stop()

	trips := []domain.Trip{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return trips, false, nil
		}
		if err != nil {
			return nil, false, err
		}
		if len(trips) == MaxListSize {
			return trips, true, nil
		}
		t, err := tripFrom(snap)
		if err != nil {
			return nil, false, err
		}
		trips = append(trips, t)
	}
}

// ListDriverTrips returns a driver's own open work: assigned plus in_progress.
func (s *Store) ListDriverTrips(ctx context.Context, driverUID string) ([]domain.Trip, error) {
	it := s.c.Collection(colTrips).
		Where("driverUid", "==", driverUID).
		Where("status", "in", []string{string(domain.TripAssigned), string(domain.TripInProgress)}).
		OrderBy("createdAt", firestore.Desc).
		Documents(ctx)
	defer it.Stop()

	trips := []domain.Trip{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return trips, nil
		}
		if err != nil {
			return nil, err
		}
		t, err := tripFrom(snap)
		if err != nil {
			return nil, err
		}
		trips = append(trips, t)
	}
}

// DefaultHistoryPage is how many finished trips a driver is shown at a time.
const DefaultHistoryPage = 20

// ListDriverHistory returns a driver's finished trips, newest first.
func (s *Store) ListDriverHistory(ctx context.Context, driverUID string, limit int) ([]domain.Trip, bool, error) {
	if limit <= 0 || limit > MaxListSize {
		limit = DefaultHistoryPage
	}

	it := s.c.Collection(colTrips).
		Where("driverUid", "==", driverUID).
		Where("status", "==", string(domain.TripCompleted)).
		OrderBy("createdAt", firestore.Desc).
		Limit(limit + 1).
		Documents(ctx)
	defer it.Stop()

	trips := []domain.Trip{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return trips, false, nil
		}
		if err != nil {
			return nil, false, err
		}
		if len(trips) == limit {
			return trips, true, nil
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return nil, false, err
		}
		trips = append(trips, trip)
	}
}
