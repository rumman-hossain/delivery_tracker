package store

import (
	"context"
	"fmt"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// AssignTrip freezes a route into a trip.
func (s *Store) AssignTrip(ctx context.Context, req domain.AssignTripRequest) (string, error) {
	route, err := s.GetRoute(ctx, req.RouteID)
	if err != nil {
		return "", err
	}
	if !route.Active {
		return "", domain.BadRequest("that route is not active")
	}

	driver, err := s.GetUser(ctx, req.DriverUID)
	if err != nil {
		return "", err
	}
	if driver.Role != domain.RoleDriver {
		return "", domain.BadRequest("that account is not a driver")
	}
	if !driver.Active {
		return "", domain.BadRequest("that driver is deactivated")
	}

	cfg, err := s.GetConfig(ctx)
	if err != nil {
		return "", err
	}

	snapshot, err := s.buildSnapshot(ctx, route, cfg.MatchRadiusM)
	if err != nil {
		return "", err
	}

	trip := domain.Trip{
		RouteID:        route.ID,
		DriverUID:      driver.UID,
		DriverName:     driver.Name,
		AssignedDate:   req.AssignedDate,
		Status:         domain.TripAssigned,
		CurrentStopSeq: 1,
		CreatedAt:      time.Now().UTC(),
		RouteSnapshot:  snapshot,
	}
	ref, _, err := s.c.Collection(colTrips).Add(ctx, trip)
	if err != nil {
		return "", err
	}
	return ref.ID, nil
}

func (s *Store) buildSnapshot(ctx context.Context, route domain.Route, globalRadiusM float64) (domain.RouteSnapshot, error) {
	start, err := s.resolvePoint(ctx, route.Start.PlaceID, "start")
	if err != nil {
		return domain.RouteSnapshot{}, err
	}
	end, err := s.resolvePoint(ctx, route.End.PlaceID, "end")
	if err != nil {
		return domain.RouteSnapshot{}, err
	}

	snap := domain.RouteSnapshot{Start: start, End: end, Stops: make([]domain.SnapshotStop, 0, len(route.Stops))}

	for _, stop := range route.Stops {
		out := domain.SnapshotStop{Seq: stop.Seq, Type: stop.Type}
		switch stop.Type {
		case domain.StopShop:
			shop, err := s.GetShop(ctx, stop.ShopID)
			if err != nil {
				return domain.RouteSnapshot{}, fmt.Errorf("stop %d references shop %s: %w", stop.Seq, stop.ShopID, err)
			}
			out = placeStop(out.Seq, shop, globalRadiusM)
		case domain.StopHome:
			out.Label = stop.Label
		default:
			return domain.RouteSnapshot{}, domain.BadRequest(fmt.Sprintf("stop %d has an unknown type %q", stop.Seq, stop.Type))
		}
		snap.Stops = append(snap.Stops, out)
	}
	return snap, nil
}

func placeStop(seq int, place domain.Shop, globalRadiusM float64) domain.SnapshotStop {
	out := domain.SnapshotStop{
		Seq:      seq,
		Type:     domain.StopShop,
		ShopID:   place.ID,
		ShopKind: place.Kind(),
		ShopName: place.Name,
	}
	if place.Kind() == domain.KindHome {
		out.Type = domain.StopHome
		out.Label = place.Name
		out.ShopName = ""
	}

	if place.HasPosition() {
		radius := domain.EffectiveRadiusM(place.RadiusM, globalRadiusM)
		out.ExpectedLat, out.ExpectedLng, out.ExpectedRadiusM = place.Lat, place.Lng, &radius
	}
	return out
}
