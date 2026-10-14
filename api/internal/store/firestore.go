package store

import (
	"context"
	"errors"
	"fmt"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

const (
	colUsers  = "users"
	colShops  = "shops"
	colRoutes = "routes"
	colTrips  = "trips"
	colConfig = "config"
	colEvents = "events"

	configDocID = "app"
)

type Store struct {
	c *firestore.Client
}

// New opens a Firestore client.
func New(ctx context.Context, projectID, databaseID string) (*Store, error) {
	var (
		c   *firestore.Client
		err error
	)
	if databaseID == "" || databaseID == "(default)" {
		c, err = firestore.NewClient(ctx, projectID)
	} else {
		c, err = firestore.NewClientWithDatabase(ctx, projectID, databaseID)
	}
	if err != nil {
		return nil, fmt.Errorf("opening firestore: %w", err)
	}
	return &Store{c: c}, nil
}

func (s *Store) Close() error { return s.c.Close() }

// Client exposes the raw client for integration tests that need to seed data.
func (s *Store) Client() *firestore.Client { return s.c }

func isNotFound(err error) bool {
	return status.Code(err) == codes.NotFound
}

func notFound(err error, what string) error {
	if status.Code(err) == codes.NotFound || errors.Is(err, iterator.Done) {
		return domain.NotFound(what + " was not found")
	}
	return err
}
