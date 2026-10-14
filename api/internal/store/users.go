package store

import (
	"context"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// PutUser writes the users/{uid} profile.
func (s *Store) PutUser(ctx context.Context, uid string, u domain.User) error {
	ref := s.c.Collection(colUsers).Doc(uid)

	snap, err := ref.Get(ctx)
	switch {
	case err == nil:
		var existing domain.User
		if err := snap.DataTo(&existing); err != nil {
			return err
		}
		u.CreatedAt = existing.CreatedAt
		u.ActiveTripID = existing.ActiveTripID
	case isNotFound(err):
		u.CreatedAt = time.Now().UTC()
	default:
		return err
	}

	_, err = ref.Set(ctx, u)
	return err
}

func (s *Store) GetUser(ctx context.Context, uid string) (domain.User, error) {
	snap, err := s.c.Collection(colUsers).Doc(uid).Get(ctx)
	if err != nil {
		return domain.User{}, notFound(err, "that user")
	}
	var u domain.User
	if err := snap.DataTo(&u); err != nil {
		return domain.User{}, err
	}
	u.UID = snap.Ref.ID
	return u, nil
}

// ListUsers returns every user, or only those holding the given role when it is set.
func (s *Store) ListUsers(ctx context.Context, role domain.Role) ([]domain.User, error) {
	it := s.c.Collection(colUsers).OrderBy("name", firestore.Asc).Documents(ctx)
	defer it.Stop()

	users := []domain.User{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return users, nil
		}
		if err != nil {
			return nil, err
		}
		var u domain.User
		if err := snap.DataTo(&u); err != nil {
			return nil, err
		}
		if role != "" && u.Role != role {
			continue
		}
		u.UID = snap.Ref.ID
		users = append(users, u)
	}
}

func (s *Store) UpdateUser(ctx context.Context, uid string, req domain.UpdateUserRequest) error {
	var updates []firestore.Update
	if req.Name != nil {
		updates = append(updates, firestore.Update{Path: "name", Value: *req.Name})
	}
	if req.PhotoPath != nil {
		updates = append(updates, firestore.Update{Path: "photoPath", Value: *req.PhotoPath})
	}
	if req.Phone != nil {
		updates = append(updates, firestore.Update{Path: "phone", Value: strings.TrimSpace(*req.Phone)})
	}
	if req.Active != nil {
		updates = append(updates, firestore.Update{Path: "active", Value: *req.Active})
	}
	if len(updates) == 0 {
		_, err := s.c.Collection(colUsers).Doc(uid).Get(ctx)
		return notFound(err, "that user")
	}
	_, err := s.c.Collection(colUsers).Doc(uid).Update(ctx, updates)
	return notFound(err, "that user")
}
