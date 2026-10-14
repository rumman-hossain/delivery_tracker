package auth

import (
	"context"
	"fmt"

	firebaseauth "firebase.google.com/go/v4/auth"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// UserAdmin is the slice of the Firebase auth client used for provisioning.
type UserAdmin interface {
	CreateUser(ctx context.Context, user *firebaseauth.UserToCreate) (*firebaseauth.UserRecord, error)
	UpdateUser(ctx context.Context, uid string, user *firebaseauth.UserToUpdate) (*firebaseauth.UserRecord, error)
	SetCustomUserClaims(ctx context.Context, uid string, claims map[string]any) error
	RevokeRefreshTokens(ctx context.Context, uid string) error
	DeleteUser(ctx context.Context, uid string) error
}

// Provisioner creates accounts and stamps their role claim.
type Provisioner struct {
	Admin UserAdmin
}

// Create makes the Firebase account and sets its role claim.
func (p Provisioner) Create(ctx context.Context, req domain.CreateUserRequest) (string, error) {
	rec, err := p.Admin.CreateUser(ctx, (&firebaseauth.UserToCreate{}).
		Email(req.Email).
		Password(req.TempPassword).
		DisplayName(req.Name))
	if err != nil {
		switch {
		case firebaseauth.IsEmailAlreadyExists(err):
			return "", domain.BadRequest("that email address already has an account")
		case firebaseauth.IsInvalidEmail(err):
			return "", domain.BadRequest("that email address is not valid")
		}
		return "", fmt.Errorf("creating the firebase account: %w", err)
	}

	if err := p.Admin.SetCustomUserClaims(ctx, rec.UID, map[string]any{"role": string(req.Role)}); err != nil {
		if delErr := p.Admin.DeleteUser(ctx, rec.UID); delErr != nil {
			return "", fmt.Errorf("setting the role claim failed (%w) and rolling back the account also failed: %v", err, delErr)
		}
		return "", fmt.Errorf("setting the role claim: %w", err)
	}
	return rec.UID, nil
}

// Delete removes a Firebase account.
func (p Provisioner) Delete(ctx context.Context, uid string) error {
	return p.Admin.DeleteUser(ctx, uid)
}

// ResetPassword sets uid's password and then revokes its refresh tokens.
func (p Provisioner) ResetPassword(ctx context.Context, uid, newPassword string) error {
	if _, err := p.Admin.UpdateUser(ctx, uid, (&firebaseauth.UserToUpdate{}).Password(newPassword)); err != nil {
		return fmt.Errorf("setting the account's password: %w", err)
	}
	if err := p.Admin.RevokeRefreshTokens(ctx, uid); err != nil {
		return fmt.Errorf("revoking refresh tokens after the password reset: %w", err)
	}
	return nil
}

// SetActive enables or disables sign-in for an account.
func (p Provisioner) SetActive(ctx context.Context, uid string, active bool) error {
	if _, err := p.Admin.UpdateUser(ctx, uid, (&firebaseauth.UserToUpdate{}).Disabled(!active)); err != nil {
		return fmt.Errorf("setting the account's disabled flag: %w", err)
	}
	if active {
		return nil
	}
	if err := p.Admin.RevokeRefreshTokens(ctx, uid); err != nil {
		return fmt.Errorf("revoking refresh tokens: %w", err)
	}
	return nil
}
