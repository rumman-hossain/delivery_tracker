package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func (s *Store) resolvePoint(ctx context.Context, placeID, which string) (domain.RoutePoint, error) {
	if strings.TrimSpace(placeID) == "" {
		return domain.RoutePoint{}, domain.BadRequest(fmt.Sprintf("this route has no %s place; open it and choose one", which))
	}

	place, err := s.GetShop(ctx, placeID)
	if err != nil {
		return domain.RoutePoint{}, fmt.Errorf("the %s place %s: %w", which, placeID, err)
	}
	if !place.Active {
		return domain.RoutePoint{}, domain.BadRequest(fmt.Sprintf("%s is not active, so a route cannot %s there", place.Name, which))
	}
	if !place.HasPosition() {
		return domain.RoutePoint{}, domain.BadRequest(fmt.Sprintf(
			"%s has no position, so a route cannot %s there; pick a warehouse or a shop", place.Name, which))
	}
	return domain.RoutePoint{PlaceID: place.ID, Name: place.Name, Lat: *place.Lat, Lng: *place.Lng}, nil
}

func (s *Store) CreateRoute(ctx context.Context, req domain.RouteRequest) (string, error) {
	start, err := s.resolvePoint(ctx, *req.StartPlaceID, "start")
	if err != nil {
		return "", err
	}
	end, err := s.resolvePoint(ctx, *req.EndPlaceID, "end")
	if err != nil {
		return "", err
	}

	route := domain.Route{
		Name:      *req.Name,
		Start:     start,
		End:       end,
		Stops:     req.Stops,
		Active:    true,
		CreatedAt: time.Now().UTC(),
	}
	if req.Active != nil {
		route.Active = *req.Active
	}
	ref, _, addErr := s.c.Collection(colRoutes).Add(ctx, route)
	if addErr != nil {
		return "", addErr
	}
	return ref.ID, nil
}

func (s *Store) GetRoute(ctx context.Context, id string) (domain.Route, error) {
	snap, err := s.c.Collection(colRoutes).Doc(id).Get(ctx)
	if err != nil {
		return domain.Route{}, notFound(err, "that route")
	}
	var r domain.Route
	if err := snap.DataTo(&r); err != nil {
		return domain.Route{}, err
	}
	r.ID = snap.Ref.ID
	return r, nil
}

func (s *Store) ListRoutes(ctx context.Context) ([]domain.Route, error) {
	it := s.c.Collection(colRoutes).OrderBy("name", firestore.Asc).Documents(ctx)
	defer it.Stop()

	routes := []domain.Route{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return routes, nil
		}
		if err != nil {
			return nil, err
		}
		var r domain.Route
		if err := snap.DataTo(&r); err != nil {
			return nil, err
		}
		r.ID = snap.Ref.ID
		routes = append(routes, r)
	}
}

// UpdateRoute applies a partial update.
func (s *Store) UpdateRoute(ctx context.Context, id string, req domain.RouteRequest) error {
	var updates []firestore.Update
	if req.Name != nil {
		updates = append(updates, firestore.Update{Path: "name", Value: *req.Name})
	}
	if req.StartPlaceID != nil {
		start, err := s.resolvePoint(ctx, *req.StartPlaceID, "start")
		if err != nil {
			return err
		}
		updates = append(updates, firestore.Update{Path: "start", Value: start})
	}
	if req.EndPlaceID != nil {
		end, err := s.resolvePoint(ctx, *req.EndPlaceID, "end")
		if err != nil {
			return err
		}
		updates = append(updates, firestore.Update{Path: "end", Value: end})
	}
	if req.Stops != nil {
		updates = append(updates, firestore.Update{Path: "stops", Value: req.Stops})
	}
	if req.Active != nil {
		updates = append(updates, firestore.Update{Path: "active", Value: *req.Active})
	}
	if len(updates) == 0 {
		_, err := s.c.Collection(colRoutes).Doc(id).Get(ctx)
		return notFound(err, "that route")
	}
	_, err := s.c.Collection(colRoutes).Doc(id).Update(ctx, updates)
	return notFound(err, "that route")
}
