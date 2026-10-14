package domain

import (
	"fmt"
	"net/mail"
	"strings"
)

// ValidateUpdateUser rejects a patch that would do nothing or blank a required field.
func ValidateUpdateUser(req UpdateUserRequest, isSelf bool) *AppError {
	if req.Name == nil && req.Phone == nil && req.Active == nil {
		return BadRequest("send at least one of name, phone or active")
	}
	if req.Name != nil && strings.TrimSpace(*req.Name) == "" {
		return BadRequest("name cannot be blank")
	}
	if req.Phone != nil {
		if err := validatePhone(*req.Phone); err != nil {
			return err
		}
	}
	if isSelf && req.Active != nil && !*req.Active {
		return BadRequest("you cannot deactivate your own account")
	}
	return nil
}

// ValidateResetPassword checks an admin-initiated password reset.
func ValidateResetPassword(req ResetPasswordRequest, isSelf bool) *AppError {
	if isSelf {
		return BadRequest("use the change-password screen to set your own password")
	}
	if len(req.NewPassword) < MinPasswordLength {
		return BadRequest(fmt.Sprintf("newPassword must be at least %d characters", MinPasswordLength))
	}
	return nil
}

// ValidateCreateUser checks admin provisioning input.
func ValidateCreateUser(req CreateUserRequest) *AppError {
	if strings.TrimSpace(req.Name) == "" {
		return BadRequest("name is required")
	}
	email := strings.TrimSpace(req.Email)
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return BadRequest("email must be a valid address")
	}
	if err := validatePhone(req.Phone); err != nil {
		return err
	}
	if len(req.TempPassword) < MinPasswordLength {
		return BadRequest(fmt.Sprintf("tempPassword must be at least %d characters", MinPasswordLength))
	}
	if req.Role != RoleDriver && req.Role != RoleAdmin && req.Role != RoleSuperadmin {
		return BadRequest(`role must be "driver", "admin" or "superadmin"`)
	}
	return nil
}

// MinPhoneDigits is the shortest number anyone could actually dial.
const MinPhoneDigits = 8

func validatePhone(phone string) *AppError {
	trimmed := strings.TrimSpace(phone)
	if trimmed == "" {
		return BadRequest("phone is required: a driver at a door needs to be able to call dispatch, and dispatch needs to reach them")
	}
	if len(trimmed) > 32 {
		return BadRequest("phone must be 32 characters or fewer")
	}

	digits := 0
	for _, r := range trimmed {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == '+' || r == '-' || r == ' ' || r == '(' || r == ')' || r == '.':
		default:
			return BadRequest("phone may contain only digits and + - ( ) . and spaces")
		}
	}
	if digits < MinPhoneDigits {
		return BadRequest(fmt.Sprintf("phone must have at least %d digits", MinPhoneDigits))
	}
	return nil
}
