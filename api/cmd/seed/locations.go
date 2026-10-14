package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

//go:embed locations.json
var locationsJSON []byte

type seedLocation struct {
	Kind    domain.LocationKind `json:"kind"`
	Name    string              `json:"name"`
	Address string              `json:"address"`
	Lat     float64             `json:"lat"`
	Lng     float64             `json:"lng"`
}

func seedLocations(ctx context.Context, st *store.Store) error {
	var file struct {
		Locations []seedLocation `json:"locations"`
	}
	if err := json.Unmarshal(locationsJSON, &file); err != nil {
		return fmt.Errorf("reading the bundled locations: %w", err)
	}

	existing, err := st.ListShops(ctx)
	if err != nil {
		return fmt.Errorf("reading the places already registered: %w", err)
	}
	byName := make(map[string]domain.Shop, len(existing))
	for _, sh := range existing {
		byName[strings.ToLower(sh.Name)] = sh
	}

	var added, skipped int
	for _, loc := range file.Locations {
		if _, ok := byName[strings.ToLower(loc.Name)]; ok {
			skipped++
			continue
		}

		kind, name, address := loc.Kind, loc.Name, loc.Address
		req := domain.ShopRequest{Kind: &kind, Name: &name, Lat: domain.Nullable[float64]{Present: true, Value: &loc.Lat}, Lng: domain.Nullable[float64]{Present: true, Value: &loc.Lng}, Address: &address}
		if vErr := domain.ValidateShop(req, true); vErr != nil {
			return fmt.Errorf("%s: %w", loc.Name, vErr)
		}
		if _, cErr := st.CreateShop(ctx, req); cErr != nil {
			return fmt.Errorf("creating %s: %w", loc.Name, cErr)
		}
		log.Printf("added %-9s %s (%.7f, %.7f)", loc.Kind, loc.Name, loc.Lat, loc.Lng)
		added++
	}

	log.Printf("locations: %d added, %d already present", added, skipped)
	return nil
}
