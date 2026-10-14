package auth

import (
	"context"
	"errors"
	"testing"

	firebaseauth "firebase.google.com/go/v4/auth"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

type fakeAdmin struct {
	created  *firebaseauth.UserToCreate
	claims   map[string]any
	deleted  string
	claimErr error

	createErr error
	updated   *firebaseauth.UserToUpdate
	revoked   string
	updateErr error
	revokeErr error
}

func (f *fakeAdmin) CreateUser(_ context.Context, u *firebaseauth.UserToCreate) (*firebaseauth.UserRecord, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	f.created = u
	return &firebaseauth.UserRecord{UserInfo: &firebaseauth.UserInfo{UID: "uid-1"}}, nil
}

func (f *fakeAdmin) UpdateUser(_ context.Context, uid string, u *firebaseauth.UserToUpdate) (*firebaseauth.UserRecord, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	f.updated = u
	return &firebaseauth.UserRecord{UserInfo: &firebaseauth.UserInfo{UID: uid}}, nil
}

func (f *fakeAdmin) SetCustomUserClaims(_ context.Context, uid string, c map[string]any) error {
	if f.claimErr != nil {
		return f.claimErr
	}
	f.claims = c
	return nil
}

func (f *fakeAdmin) RevokeRefreshTokens(_ context.Context, uid string) error {
	if f.revokeErr != nil {
		return f.revokeErr
	}
	f.revoked = uid
	return nil
}

func (f *fakeAdmin) DeleteUser(_ context.Context, uid string) error {
	f.deleted = uid
	return nil
}

func TestSeedCreatesAnAdmin(t *testing.T) {
	fake := &fakeAdmin{}
	p := Provisioner{Admin: fake}

	uid, err := p.Create(context.Background(), domain.CreateUserRequest{
		Email:        "admin@example.com",
		Name:         "Admin",
		TempPassword: "a-long-temp-password",
		Role:         domain.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("seeding the admin: %v", err)
	}
	if uid != "uid-1" {
		t.Fatalf("uid = %q, want uid-1", uid)
	}
	if fake.claims["role"] != "admin" {
		t.Fatalf("role claim = %v, want admin", fake.claims["role"])
	}
}

func TestSeedRollsBackWhenTheClaimFails(t *testing.T) {
	fake := &fakeAdmin{claimErr: errors.New("boom")}
	p := Provisioner{Admin: fake}

	if _, err := p.Create(context.Background(), domain.CreateUserRequest{
		Email:        "admin@example.com",
		Name:         "Admin",
		TempPassword: "a-long-temp-password",
		Role:         domain.RoleAdmin,
	}); err == nil {
		t.Fatal("expected an error when the claim cannot be set")
	}
	if fake.deleted != "uid-1" {
		t.Fatalf("account was not rolled back; deleted = %q", fake.deleted)
	}
}

// Deactivating must disable the Firebase account and revoke refresh tokens.
func TestSetActiveFalseDisablesAndRevokes(t *testing.T) {
	fake := &fakeAdmin{}
	p := Provisioner{Admin: fake}

	if err := p.SetActive(context.Background(), "uid-1", false); err != nil {
		t.Fatalf("deactivating: %v", err)
	}
	if fake.updated == nil {
		t.Fatal("the firebase account was never updated")
	}
	if fake.revoked != "uid-1" {
		t.Fatalf("refresh tokens were not revoked; revoked = %q", fake.revoked)
	}
}

// Reactivating re-enables the account but must not revoke anything.
func TestSetActiveTrueDoesNotRevoke(t *testing.T) {
	fake := &fakeAdmin{}
	p := Provisioner{Admin: fake}

	if err := p.SetActive(context.Background(), "uid-1", true); err != nil {
		t.Fatalf("reactivating: %v", err)
	}
	if fake.updated == nil {
		t.Fatal("the firebase account was never updated")
	}
	if fake.revoked != "" {
		t.Fatalf("reactivating must not revoke tokens; revoked = %q", fake.revoked)
	}
}

func TestResetPassword(t *testing.T) {
	t.Run("sets the password and kills every existing session", func(t *testing.T) {
		f := &fakeAdmin{}
		if err := (Provisioner{Admin: f}).ResetPassword(context.Background(), "uid-1", "brandnew1"); err != nil {
			t.Fatalf("ResetPassword: %v", err)
		}
		if f.updated == nil {
			t.Fatal("the account was never updated")
		}
		if f.revoked != "uid-1" {
			t.Fatalf("revoked = %q, want uid-1", f.revoked)
		}
	})

	t.Run("does not revoke anything when the password never changed", func(t *testing.T) {
		f := &fakeAdmin{updateErr: errors.New("firebase unavailable")}
		if err := (Provisioner{Admin: f}).ResetPassword(context.Background(), "uid-1", "brandnew1"); err == nil {
			t.Fatal("a failed password write must be an error")
		}
		if f.revoked != "" {
			t.Fatalf("revoked = %q after a failed update, want none", f.revoked)
		}
	})

	t.Run("surfaces a revocation failure rather than swallowing it", func(t *testing.T) {
		f := &fakeAdmin{revokeErr: errors.New("firebase unavailable")}
		err := (Provisioner{Admin: f}).ResetPassword(context.Background(), "uid-1", "brandnew1")
		if err == nil {
			t.Fatal("a failed revocation must be reported: the old sessions are still live")
		}
	})
}
