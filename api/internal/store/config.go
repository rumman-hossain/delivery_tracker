package store

import (
	"context"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// GetConfig reads config/app, seeding the documented default when the document does not exist yet.
func (s *Store) GetConfig(ctx context.Context) (domain.AppConfig, error) {
	snap, err := s.c.Collection(colConfig).Doc(configDocID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.AppConfig{MatchRadiusM: domain.DefaultMatchRadiusM}, nil
	}
	if err != nil {
		return domain.AppConfig{}, err
	}
	var cfg domain.AppConfig
	if err := snap.DataTo(&cfg); err != nil {
		return domain.AppConfig{}, err
	}
	if cfg.MatchRadiusM == 0 {
		cfg.MatchRadiusM = domain.DefaultMatchRadiusM
	}
	return cfg, nil
}

// SetConfig writes the global fallback radius.
func (s *Store) SetConfig(ctx context.Context, radiusM float64) error {
	_, err := s.c.Collection(colConfig).Doc(configDocID).Set(ctx, map[string]any{
		"matchRadiusM": radiusM,
	}, firestore.MergeAll)
	return err
}
