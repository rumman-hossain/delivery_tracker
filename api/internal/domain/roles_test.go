package domain

import "testing"

func TestIsAdminTier(t *testing.T) {
	cases := []struct {
		role Role
		want bool
	}{
		{RoleSuperadmin, true},
		{RoleAdmin, true},
		{RoleDriver, false},
		{Role(""), false},
		{Role("manager"), false},
	}
	for _, c := range cases {
		if got := IsAdminTier(c.role); got != c.want {
			t.Errorf("IsAdminTier(%q) = %v, want %v", c.role, got, c.want)
		}
	}
}

func TestCanCreateRole(t *testing.T) {
	cases := []struct {
		name   string
		actor  Role
		target Role
		want   bool
	}{
		{"a superadmin makes an admin", RoleSuperadmin, RoleAdmin, true},
		{"a superadmin makes a driver", RoleSuperadmin, RoleDriver, true},
		{"not even a superadmin makes a superadmin", RoleSuperadmin, RoleSuperadmin, false},

		{"an admin makes a driver", RoleAdmin, RoleDriver, true},
		{"an admin cannot make a peer", RoleAdmin, RoleAdmin, false},
		{"an admin cannot promote to superadmin", RoleAdmin, RoleSuperadmin, false},

		{"a driver makes nothing", RoleDriver, RoleDriver, false},
		{"a driver cannot make an admin", RoleDriver, RoleAdmin, false},
		{"an unknown role makes nothing", Role("manager"), RoleDriver, false},
		{"an empty role makes nothing", Role(""), RoleDriver, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := CanCreateRole(c.actor, c.target); got != c.want {
				t.Errorf("CanCreateRole(%q, %q) = %v, want %v", c.actor, c.target, got, c.want)
			}
		})
	}
}

func TestCanManageUser(t *testing.T) {
	mine := User{Role: RoleDriver, CreatedBy: "admin-1"}
	theirs := User{Role: RoleDriver, CreatedBy: "admin-2"}
	orphan := User{Role: RoleDriver}
	peer := User{Role: RoleAdmin, CreatedBy: "super-1"}
	boss := User{Role: RoleSuperadmin}

	cases := []struct {
		name      string
		actorRole Role
		actorUID  string
		target    User
		want      bool
	}{
		{"a superadmin manages any driver", RoleSuperadmin, "super-1", theirs, true},
		{"a superadmin manages an admin", RoleSuperadmin, "super-1", peer, true},
		{"a superadmin manages another superadmin", RoleSuperadmin, "super-1", boss, true},

		{"an admin manages the driver they created", RoleAdmin, "admin-1", mine, true},
		{"an admin cannot manage another admin's driver", RoleAdmin, "admin-1", theirs, false},
		{"an admin cannot manage an unowned driver", RoleAdmin, "admin-1", orphan, false},
		{"an admin cannot manage a peer", RoleAdmin, "admin-1", peer, false},
		{"an admin cannot manage a superadmin", RoleAdmin, "admin-1", boss, false},

		{"a driver manages nobody", RoleDriver, "driver-1", mine, false},
		{"an admin with no uid manages nobody", RoleAdmin, "", orphan, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := CanManageUser(c.actorRole, c.actorUID, c.target)
			if got != c.want {
				t.Errorf("CanManageUser(%q, %q, %+v) = %v, want %v",
					c.actorRole, c.actorUID, c.target, got, c.want)
			}
		})
	}
}

func TestScopeUserList(t *testing.T) {
	all := []User{
		{UID: "d1", Role: RoleDriver, CreatedBy: "admin-1"},
		{UID: "d2", Role: RoleDriver, CreatedBy: "admin-2"},
		{UID: "a1", Role: RoleAdmin, CreatedBy: "super-1"},
		{UID: "s1", Role: RoleSuperadmin},
	}

	t.Run("a superadmin sees everything untouched", func(t *testing.T) {
		got := ScopeUserList(all, RoleSuperadmin, "super-1")
		if len(got) != len(all) {
			t.Fatalf("got %d users, want %d", len(got), len(all))
		}
	})

	t.Run("an admin sees only what they created", func(t *testing.T) {
		got := ScopeUserList(all, RoleAdmin, "admin-1")
		if len(got) != 1 || got[0].UID != "d1" {
			t.Fatalf("got %+v, want only d1", got)
		}
	})

	t.Run("an admin who created nobody sees nobody", func(t *testing.T) {
		got := ScopeUserList(all, RoleAdmin, "admin-9")
		if len(got) != 0 {
			t.Fatalf("got %+v, want none", got)
		}
		if got == nil {
			t.Fatal("an empty scope must be an empty slice, not nil")
		}
	})

	t.Run("a driver sees nobody", func(t *testing.T) {
		if got := ScopeUserList(all, RoleDriver, "driver-1"); len(got) != 0 || got == nil {
			t.Fatalf("got %+v, want an empty slice", got)
		}
	})

	t.Run("scoping never reveals an admin or a superadmin to an admin", func(t *testing.T) {
		withPeer := append([]User{{UID: "a2", Role: RoleAdmin, CreatedBy: "admin-1"}}, all...)
		for _, u := range ScopeUserList(withPeer, RoleAdmin, "admin-1") {
			if u.Role != RoleDriver {
				t.Fatalf("an admin was shown a %s account", u.Role)
			}
		}
	})
}

func TestValidateUpdateUserSelfGuard(t *testing.T) {
	off, on := false, true
	name := "Sato"
	blank := "   "

	cases := []struct {
		name     string
		req      UpdateUserRequest
		isSelf   bool
		wantCode Code
	}{
		{"deactivating someone else is fine", UpdateUserRequest{Active: &off}, false, ""},
		{"deactivating yourself is refused", UpdateUserRequest{Active: &off}, true, CodeBadRequest},
		{"reactivating yourself is fine", UpdateUserRequest{Active: &on}, true, ""},
		{"renaming yourself is fine", UpdateUserRequest{Name: &name}, true, ""},
		{"an empty patch is refused", UpdateUserRequest{}, false, CodeBadRequest},
		{"a blank name is refused", UpdateUserRequest{Name: &blank}, false, CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertCode(t, ValidateUpdateUser(c.req, c.isSelf), c.wantCode)
		})
	}
}

func TestValidateResetPassword(t *testing.T) {
	cases := []struct {
		name     string
		req      ResetPasswordRequest
		isSelf   bool
		wantCode Code
	}{
		{"a long enough password for someone else", ResetPasswordRequest{"temp1234"}, false, ""},
		{"exactly the minimum is accepted", ResetPasswordRequest{"12345678"}, false, ""},
		{"one short is refused", ResetPasswordRequest{"1234567"}, false, CodeBadRequest},
		{"an empty password is refused", ResetPasswordRequest{""}, false, CodeBadRequest},
		{"resetting your own is refused", ResetPasswordRequest{"temp1234"}, true, CodeBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertCode(t, ValidateResetPassword(c.req, c.isSelf), c.wantCode)
		})
	}

	t.Run("the self refusal takes precedence over length", func(t *testing.T) {
		err := ValidateResetPassword(ResetPasswordRequest{"short"}, true)
		if err == nil {
			t.Fatal("a self-targeted reset must be refused")
		}
		if err.Message != "use the change-password screen to set your own password" {
			t.Fatalf("message = %q, want the self-service message", err.Message)
		}
	})
}
