package domain

// IsAdminTier reports whether a role may reach the /admin area at all.
func IsAdminTier(r Role) bool {
	return r == RoleAdmin || r == RoleSuperadmin
}

// CanCreateRole reports whether actor may provision an account holding target's role.
func CanCreateRole(actor, target Role) bool {
	switch actor {
	case RoleSuperadmin:
		return target == RoleAdmin || target == RoleDriver
	case RoleAdmin:
		return target == RoleDriver
	default:
		return false
	}
}

// CanManageUser reports whether actor may write to target's account -- rename it, deactivate it, or reset its password.
func CanManageUser(actorRole Role, actorUID string, target User) bool {
	if actorRole == RoleSuperadmin {
		return true
	}
	if actorRole != RoleAdmin || actorUID == "" {
		return false
	}
	return target.Role == RoleDriver && target.CreatedBy == actorUID
}

// ScopeUserList narrows a list of accounts to what actor is allowed to see.
func ScopeUserList(users []User, actorRole Role, actorUID string) []User {
	if actorRole == RoleSuperadmin {
		return users
	}

	scoped := []User{}
	for _, u := range users {
		if CanManageUser(actorRole, actorUID, u) {
			scoped = append(scoped, u)
		}
	}
	return scoped
}
