package store

import (
	"context"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func (s *Store) CreateShop(ctx context.Context, req domain.ShopRequest) (string, error) {
	shop := domain.Shop{
		LocationKind: domain.KindShop,
		Name:         *req.Name,
		Lat:          req.Lat.Value,
		Lng:          req.Lng.Value,
		Active:       true,
		CreatedAt:    time.Now().UTC(),
	}
	if req.Kind != nil {
		shop.LocationKind = *req.Kind
	}
	if req.Address != nil {
		shop.Address = *req.Address
	}
	if req.RadiusM.Present {
		shop.RadiusM = req.RadiusM.Value
	}
	if req.Active != nil {
		shop.Active = *req.Active
	}

	ref, _, err := s.c.Collection(colShops).Add(ctx, shop)
	if err != nil {
		return "", err
	}
	return ref.ID, nil
}

func (s *Store) GetShop(ctx context.Context, id string) (domain.Shop, error) {
	snap, err := s.c.Collection(colShops).Doc(id).Get(ctx)
	if err != nil {
		return domain.Shop{}, notFound(err, "that shop")
	}
	var shop domain.Shop
	if err := snap.DataTo(&shop); err != nil {
		return domain.Shop{}, err
	}
	shop.ID = snap.Ref.ID
	return shop, nil
}

func (s *Store) ListShops(ctx context.Context) ([]domain.Shop, error) {
	it := s.c.Collection(colShops).OrderBy("name", firestore.Asc).Documents(ctx)
	defer it.Stop()

	shops := []domain.Shop{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return shops, nil
		}
		if err != nil {
			return nil, err
		}
		var shop domain.Shop
		if err := snap.DataTo(&shop); err != nil {
			return nil, err
		}
		shop.ID = snap.Ref.ID
		shops = append(shops, shop)
	}
}

// UpdateShop applies a partial update.
func (s *Store) UpdateShop(ctx context.Context, id string, req domain.ShopRequest) error {
	var updates []firestore.Update
	if req.Kind != nil {
		updates = append(updates, firestore.Update{Path: "kind", Value: string(*req.Kind)})
	}
	if req.Name != nil {
		updates = append(updates, firestore.Update{Path: "name", Value: *req.Name})
	}
	if req.Lat.Present {
		updates = append(updates,
			firestore.Update{Path: "lat", Value: req.Lat.Value},
			firestore.Update{Path: "lng", Value: req.Lng.Value},
		)
	}
	if req.Address != nil {
		updates = append(updates, firestore.Update{Path: "address", Value: *req.Address})
	}
	if req.RadiusM.Present {
		updates = append(updates, firestore.Update{Path: "radiusM", Value: req.RadiusM.Value})
	}
	if req.Active != nil {
		updates = append(updates, firestore.Update{Path: "active", Value: *req.Active})
	}
	if len(updates) == 0 {
		_, err := s.c.Collection(colShops).Doc(id).Get(ctx)
		return notFound(err, "that shop")
	}

	ref := s.c.Collection(colShops).Doc(id)
	return s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			return notFound(err, "that shop")
		}
		var current domain.Shop
		if err := snap.DataTo(&current); err != nil {
			return err
		}

		kind := current.Kind()
		if req.Kind != nil {
			kind = *req.Kind
		}
		hasPosition := current.HasPosition()
		if req.Lat.Present {
			hasPosition = req.Lat.Value != nil
		}

		if kind != domain.KindHome && !hasPosition {
			return domain.BadRequest(
				"a shop or warehouse needs a position; give it one, or make it a home delivery")
		}
		return tx.Update(ref, updates)
	})
}
