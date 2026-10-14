package store

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// EditTripStops replaces the stops a driver has not reached yet.
func (s *Store) EditTripStops(
	ctx context.Context,
	tripID, actorUID string,
	actorRole domain.Role,
	req domain.EditTripStopsRequest,
) (domain.Trip, error) {
	cfg, err := s.GetConfig(ctx)
	if err != nil {
		return domain.Trip{}, err
	}

	pending := make([]domain.SnapshotStop, 0, len(req.Stops))
	for _, stop := range req.Stops {
		out := domain.SnapshotStop{Type: stop.Type}
		switch stop.Type {
		case domain.StopShop:
			shop, sErr := s.GetShop(ctx, stop.ShopID)
			if sErr != nil {
				return domain.Trip{}, domain.BadRequest("a stop references a place that no longer exists")
			}
			if !shop.Active {
				return domain.Trip{}, domain.BadRequest(shop.Name + " is not active, so it cannot be added to a route")
			}
			out = placeStop(out.Seq, shop, cfg.MatchRadiusM)
		case domain.StopHome:
			out.Label = stop.Label
		default:
			return domain.Trip{}, domain.BadRequest("a stop has an unknown type")
		}
		pending = append(pending, out)
	}

	tripRef := s.c.Collection(colTrips).Doc(tripID)
	events := tripRef.Collection(colEvents)

	var updated domain.Trip
	err = s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, tErr := tx.Get(tripRef)
		if tErr != nil {
			return notFound(tErr, "that trip")
		}
		trip, tErr := tripFrom(snap)
		if tErr != nil {
			return tErr
		}
		if trip.Status == domain.TripCompleted {
			return domain.Conflict(domain.CodeTripNotActive, "this trip is complete and cannot be changed")
		}
		if trip.CurrentStopSeq != req.FromStopSeq {
			return domain.Conflict(domain.CodeOutOfOrder,
				"the driver has moved on since you opened this. Reopen it to see where they are now.")
		}
		if trip.RouteVersion != req.RouteVersion {
			return domain.Conflict(domain.CodeOutOfOrder,
				"someone else changed this route while you were editing it. Reopen it to see the current stops.")
		}

		recorded := trip.CurrentStopSeq - 1
		trip.RouteSnapshot.Stops = domain.MergePendingStops(
			trip.RouteSnapshot.Stops, trip.CurrentStopSeq, pending,
		)

		if first, second, dup := domain.FirstDuplicateShop(trip.RouteSnapshot.Stops, trip.CurrentStopSeq); dup {
			return domain.BadRequest(fmt.Sprintf(
				"stop %d is a place this trip already calls at as stop %d; a round visits each place once",
				second, first))
		}

		trip.RouteVersion++

		ev := domain.Event{
			Type:       domain.EventRouteChanged,
			ServerTime: time.Now().UTC(),
			ByUID:      actorUID,
			ByRole:     actorRole,
			Reason:     req.Reason,
			Changes: map[string]any{
				"recordedStops": recorded,
				"pendingStops":  len(pending),
				"stopNames":     stopNames(pending),
			},
		}
		if err := tx.Create(events.NewDoc(), ev); err != nil {
			return err
		}

		trip.RouteNote = &domain.RouteNote{Reason: ev.Reason, At: ev.ServerTime, ByRole: ev.ByRole}

		updated = trip
		return tx.Set(tripRef, trip)
	})
	if err != nil {
		return domain.Trip{}, err
	}

	updated.ID = tripID
	return updated, nil
}

func stopNames(stops []domain.SnapshotStop) []string {
	names := make([]string, 0, len(stops))
	for _, st := range stops {
		if st.Type == domain.StopHome {
			names = append(names, st.Label)
			continue
		}
		names = append(names, st.ShopName)
	}
	return names
}
