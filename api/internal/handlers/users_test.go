package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
)

func TestCreateUser(t *testing.T) {
	const good = `{"name":"Sato","email":"sato@example.com","phone":"090-1234-5678","tempPassword":"temp1234","role":"driver"}`

	t.Run("creates the account then the document", func(t *testing.T) {
		fs, fp := &fakeStore{}, &fakeProvisioner{createUID: "uid-9"}
		rec := call(newAPI(fs, fp, nil).CreateUser, http.MethodPost, "/admin/users", good, &adminPrincipal)

		requireStatus(t, rec, http.StatusCreated)
		var body struct {
			UID string `json:"uid"`
		}
		decode(t, rec, &body)
		if body.UID != "uid-9" {
			t.Fatalf("uid = %q, want uid-9", body.UID)
		}
		if fs.putUserUID != "uid-9" {
			t.Fatalf("the user document was written for %q, want uid-9", fs.putUserUID)
		}
	})

	t.Run("a malformed body is rejected before anything is created", func(t *testing.T) {
		fp := &fakeProvisioner{createUID: "uid-9"}
		rec := call(newAPI(nil, fp, nil).CreateUser, http.MethodPost, "/admin/users", `{"name":""}`, &adminPrincipal)

		requireStatus(t, rec, http.StatusBadRequest)
		if got := errCode(t, rec); got != string(domain.CodeBadRequest) {
			t.Fatalf("code = %q", got)
		}
		if fp.deleted != "" {
			t.Fatal("nothing should have been rolled back; nothing was created")
		}
	})

	t.Run("a failed document write rolls the account back", func(t *testing.T) {
		fs := &fakeStore{putUserErr: errors.New("firestore unavailable")}
		fp := &fakeProvisioner{createUID: "uid-9"}
		rec := call(newAPI(fs, fp, nil).CreateUser, http.MethodPost, "/admin/users", good, &adminPrincipal)

		requireStatus(t, rec, http.StatusInternalServerError)
		if fp.deleted != "uid-9" {
			t.Fatalf("the orphaned account was not deleted; deleted = %q", fp.deleted)
		}
	})

	t.Run("a client-caused provisioning failure is a 400, not a 500", func(t *testing.T) {
		fp := &fakeProvisioner{createErr: domain.BadRequest("that email address already has an account")}
		rec := call(newAPI(nil, fp, nil).CreateUser, http.MethodPost, "/admin/users", good, &adminPrincipal)

		requireStatus(t, rec, http.StatusBadRequest)
		if got := errCode(t, rec); got != string(domain.CodeBadRequest) {
			t.Fatalf("code = %q, want BAD_REQUEST", got)
		}
	})
}

func TestListUsersValidatesTheRoleFilter(t *testing.T) {
	t.Run("a known role is passed through", func(t *testing.T) {
		fs := &fakeStore{}
		rec := call(newAPI(fs, nil, nil).ListUsers, http.MethodGet, "/admin/users?role=driver", "", &adminPrincipal)
		requireStatus(t, rec, http.StatusOK)
		if fs.listUsersBy != domain.RoleDriver {
			t.Fatalf("filter = %q, want driver", fs.listUsersBy)
		}
	})

	t.Run("an unknown role is refused", func(t *testing.T) {
		rec := call(newAPI(nil, nil, nil).ListUsers, http.MethodGet, "/admin/users?role=manager", "", &adminPrincipal)
		requireStatus(t, rec, http.StatusBadRequest)
	})
}

func TestUpdateUser(t *testing.T) {
	t.Run("an empty patch is refused", func(t *testing.T) {
		rec := callP(newAPI(nil, nil, nil).UpdateUser, http.MethodPatch, "/admin/users/u1", `{}`,
			&adminPrincipal, map[string]string{"uid": "u1"})
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("a blank name is refused", func(t *testing.T) {
		rec := callP(newAPI(nil, nil, nil).UpdateUser, http.MethodPatch, "/admin/users/u1", `{"name":"   "}`,
			&adminPrincipal, map[string]string{"uid": "u1"})
		requireStatus(t, rec, http.StatusBadRequest)
	})

	t.Run("deactivating disables the account, not just the document", func(t *testing.T) {
		fs, fp := &fakeStore{getUser: ownDriver}, &fakeProvisioner{}
		rec := callP(newAPI(fs, fp, nil).UpdateUser, http.MethodPatch, "/admin/users/u1", `{"active":false}`,
			&adminPrincipal, map[string]string{"uid": "u1"})

		requireStatus(t, rec, http.StatusOK)
		if fp.setActiveTo == nil {
			t.Fatal("the firebase account was never touched")
		}
		if *fp.setActiveTo {
			t.Fatal("SetActive was called with true, want false")
		}
	})

	t.Run("a failure to disable stops the document write", func(t *testing.T) {
		fs := &fakeStore{getUser: ownDriver}
		fp := &fakeProvisioner{setActiveErr: errors.New("firebase unavailable")}
		rec := callP(newAPI(fs, fp, nil).UpdateUser, http.MethodPatch, "/admin/users/u1", `{"active":false}`,
			&adminPrincipal, map[string]string{"uid": "u1"})

		requireStatus(t, rec, http.StatusInternalServerError)
		if fs.updatedUser.Active != nil {
			t.Fatal("the document was updated even though the account could not be disabled")
		}
	})

	t.Run("a name-only patch does not touch firebase", func(t *testing.T) {
		fp := &fakeProvisioner{}
		rec := callP(newAPI(&fakeStore{getUser: ownDriver}, fp, nil).UpdateUser, http.MethodPatch,
			"/admin/users/u1", `{"name":"Sato"}`,
			&adminPrincipal, map[string]string{"uid": "u1"})

		requireStatus(t, rec, http.StatusOK)
		if fp.setActiveTo != nil {
			t.Fatal("SetActive was called for a name-only patch")
		}
	})
}

func TestCreateUserRespectsTheTier(t *testing.T) {
	body := func(role string) string {
		return `{"name":"Sato","email":"sato@example.com","phone":"090-1234-5678","tempPassword":"temp1234","role":"` + role + `"}`
	}

	cases := []struct {
		name       string
		actor      auth.Principal
		role       string
		wantStatus int
	}{
		{"a superadmin creates an admin", superadminPrincipal, "admin", http.StatusCreated},
		{"a superadmin creates a driver", superadminPrincipal, "driver", http.StatusCreated},
		{"not even a superadmin creates a superadmin", superadminPrincipal, "superadmin", http.StatusForbidden},

		{"an admin creates a driver", adminPrincipal, "driver", http.StatusCreated},
		{"an admin cannot create a peer", adminPrincipal, "admin", http.StatusForbidden},
		{"an admin cannot create a superadmin", adminPrincipal, "superadmin", http.StatusForbidden},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fs, fp := &fakeStore{}, &fakeProvisioner{createUID: "uid-1"}
			actor := c.actor
			rec := call(newAPI(fs, fp, nil).CreateUser, http.MethodPost, "/admin/users", body(c.role), &actor)

			requireStatus(t, rec, c.wantStatus)
			if c.wantStatus == http.StatusForbidden && fp.created != nil {
				t.Fatal("the account was provisioned before the permission check")
			}
		})
	}
}

func TestCreateUserRecordsWhoCreatedIt(t *testing.T) {
	fs, fp := &fakeStore{}, &fakeProvisioner{createUID: "uid-1"}
	actor := adminPrincipal
	rec := call(newAPI(fs, fp, nil).CreateUser, http.MethodPost, "/admin/users",
		`{"name":"Sato","email":"sato@example.com","phone":"090-1234-5678","tempPassword":"temp1234","role":"driver"}`, &actor)

	requireStatus(t, rec, http.StatusCreated)
	if fs.putUser.CreatedBy != adminPrincipal.UID {
		t.Fatalf("createdBy = %q, want %q", fs.putUser.CreatedBy, adminPrincipal.UID)
	}
}

func TestListUsersIsScopedToTheCaller(t *testing.T) {
	all := []domain.User{
		{UID: "d1", Role: domain.RoleDriver, CreatedBy: adminPrincipal.UID},
		{UID: "d2", Role: domain.RoleDriver, CreatedBy: "admin-2"},
		{UID: "a1", Role: domain.RoleAdmin, CreatedBy: superadminPrincipal.UID},
		{UID: "s1", Role: domain.RoleSuperadmin},
	}

	decode := func(t *testing.T, rec *httptest.ResponseRecorder) []domain.User {
		t.Helper()
		var got struct {
			Users []domain.User `json:"users"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decoding %q: %v", rec.Body.String(), err)
		}
		return got.Users
	}

	t.Run("a superadmin sees every account", func(t *testing.T) {
		actor := superadminPrincipal
		rec := call(newAPI(&fakeStore{listUsers: all}, nil, nil).ListUsers, http.MethodGet, "/admin/users", "", &actor)
		requireStatus(t, rec, http.StatusOK)
		if len(decode(t, rec)) != len(all) {
			t.Fatalf("got %d users, want %d", len(decode(t, rec)), len(all))
		}
	})

	t.Run("an admin sees only the drivers they created", func(t *testing.T) {
		actor := adminPrincipal
		rec := call(newAPI(&fakeStore{listUsers: all}, nil, nil).ListUsers, http.MethodGet, "/admin/users", "", &actor)
		requireStatus(t, rec, http.StatusOK)

		users := decode(t, rec)
		if len(users) != 1 || users[0].UID != "d1" {
			t.Fatalf("got %+v, want only d1", users)
		}
	})

	t.Run("an admin is never shown an admin or a superadmin", func(t *testing.T) {
		actor := adminPrincipal
		rec := call(newAPI(&fakeStore{listUsers: all}, nil, nil).ListUsers, http.MethodGet, "/admin/users", "", &actor)
		for _, u := range decode(t, rec) {
			if u.Role != domain.RoleDriver {
				t.Fatalf("an admin was shown a %s account", u.Role)
			}
		}
	})

	t.Run("an empty scope encodes as a list, not null", func(t *testing.T) {
		actor := adminPrincipal
		rec := call(newAPI(&fakeStore{listUsers: nil}, nil, nil).ListUsers, http.MethodGet, "/admin/users", "", &actor)
		requireStatus(t, rec, http.StatusOK)
		if !strings.Contains(rec.Body.String(), `"users":[]`) {
			t.Fatalf("body = %s, want an empty array", rec.Body.String())
		}
	})

	t.Run("superadmin is now a valid role filter", func(t *testing.T) {
		actor := superadminPrincipal
		rec := call(newAPI(&fakeStore{}, nil, nil).ListUsers, http.MethodGet, "/admin/users?role=superadmin", "", &actor)
		requireStatus(t, rec, http.StatusOK)
	})
}

func TestUpdateUserRespectsOwnership(t *testing.T) {
	off := `{"active":false}`

	cases := []struct {
		name       string
		actor      auth.Principal
		target     domain.User
		body       string
		wantStatus int
	}{
		{"a superadmin may deactivate an admin", superadminPrincipal, peerAdmin, off, http.StatusOK},
		{"an admin may deactivate their own driver", adminPrincipal, ownDriver, off, http.StatusOK},
		{"an admin cannot touch another admin's driver", adminPrincipal, othersDriver, off, http.StatusNotFound},
		{"an admin cannot deactivate a peer", adminPrincipal, peerAdmin, off, http.StatusNotFound},
		{"an admin cannot deactivate a superadmin", adminPrincipal, theSuperuser, off, http.StatusNotFound},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fp := &fakeProvisioner{}
			actor := c.actor
			rec := callP(newAPI(&fakeStore{getUser: c.target}, fp, nil).UpdateUser, http.MethodPatch,
				"/admin/users/u1", c.body, &actor, map[string]string{"uid": "u1"})

			requireStatus(t, rec, c.wantStatus)
			if c.wantStatus == http.StatusNotFound && fp.setActiveTo != nil {
				t.Fatal("the account was disabled before the permission check")
			}
		})
	}

	t.Run("nobody may deactivate themselves", func(t *testing.T) {
		fp := &fakeProvisioner{}
		actor := superadminPrincipal
		rec := callP(newAPI(&fakeStore{getUser: theSuperuser}, fp, nil).UpdateUser, http.MethodPatch,
			"/admin/users/"+actor.UID, off, &actor, map[string]string{"uid": actor.UID})

		requireStatus(t, rec, http.StatusBadRequest)
		if fp.setActiveTo != nil {
			t.Fatal("SetActive ran for a self-deactivation")
		}
	})
}

func TestResetUserPassword(t *testing.T) {
	good := `{"newPassword":"brandnew1"}`

	cases := []struct {
		name       string
		actor      auth.Principal
		target     domain.User
		body       string
		wantStatus int
	}{
		{"a superadmin resets an admin", superadminPrincipal, peerAdmin, good, http.StatusOK},
		{"a superadmin resets any driver", superadminPrincipal, othersDriver, good, http.StatusOK},
		{"an admin resets their own driver", adminPrincipal, ownDriver, good, http.StatusOK},
		{"an admin cannot reset another admin's driver", adminPrincipal, othersDriver, good, http.StatusNotFound},
		{"an admin cannot reset a peer", adminPrincipal, peerAdmin, good, http.StatusNotFound},
		{"an admin cannot reset a superadmin", adminPrincipal, theSuperuser, good, http.StatusNotFound},
		{"a short password is refused", adminPrincipal, ownDriver, `{"newPassword":"short"}`, http.StatusBadRequest},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fp := &fakeProvisioner{}
			actor := c.actor
			rec := callP(newAPI(&fakeStore{getUser: c.target}, fp, nil).ResetUserPassword, http.MethodPost,
				"/admin/users/u1/password", c.body, &actor, map[string]string{"uid": "u1"})

			requireStatus(t, rec, c.wantStatus)
			if c.wantStatus == http.StatusOK && fp.resetTo != "brandnew1" {
				t.Fatalf("the provisioner got %q, want the new password", fp.resetTo)
			}
			if c.wantStatus != http.StatusOK && fp.resetUID != "" {
				t.Fatal("the password was changed before the request was accepted")
			}
		})
	}

	t.Run("resetting your own password here is refused", func(t *testing.T) {
		fp := &fakeProvisioner{}
		actor := adminPrincipal
		rec := callP(newAPI(&fakeStore{getUser: ownDriver}, fp, nil).ResetUserPassword, http.MethodPost,
			"/admin/users/"+actor.UID+"/password", good, &actor, map[string]string{"uid": actor.UID})

		requireStatus(t, rec, http.StatusBadRequest)
		if fp.resetUID != "" {
			t.Fatal("a self-reset reached the provisioner")
		}
	})

	t.Run("a missing user is indistinguishable from someone else's", func(t *testing.T) {
		actor := adminPrincipal
		missing := callP(newAPI(&fakeStore{getUserErr: domain.NotFound("that user")}, &fakeProvisioner{}, nil).ResetUserPassword,
			http.MethodPost, "/admin/users/u1/password", good, &actor, map[string]string{"uid": "u1"})
		notMine := callP(newAPI(&fakeStore{getUser: othersDriver}, &fakeProvisioner{}, nil).ResetUserPassword,
			http.MethodPost, "/admin/users/u1/password", good, &actor, map[string]string{"uid": "u1"})

		if missing.Code != notMine.Code || missing.Body.String() != notMine.Body.String() {
			t.Fatalf("responses differ:\n  missing: %d %s\n  not mine: %d %s",
				missing.Code, missing.Body.String(), notMine.Code, notMine.Body.String())
		}
	})
}

// A photo of the person, so an operator can tell who a driver is.
func TestUserPhoto(t *testing.T) {
	ownDriverUser := domain.User{UID: "d1", Role: domain.RoleDriver, Name: "Sato", Active: true, CreatedBy: adminPrincipal.UID}

	t.Run("mints an upload url at the account's own path", func(t *testing.T) {
		ph := &fakePhotos{uploadURL: "https://storage.example/put"}
		rec := callP(newAPI(&fakeStore{getUser: ownDriverUser}, nil, ph).UserPhotoUploadURL,
			http.MethodPost, "/admin/users/d1/photo-url", "", &adminPrincipal, map[string]string{"uid": "d1"})

		requireStatus(t, rec, http.StatusOK)
		var got domain.PhotoURLResponse
		decode(t, rec, &got)
		if want := media.UserPhotoPath("d1"); got.PhotoPath != want {
			t.Fatalf("photoPath = %q, want %q", got.PhotoPath, want)
		}
	})

	t.Run("will not mint one for another admin's driver", func(t *testing.T) {
		fs := &fakeStore{getUser: domain.User{UID: "d2", Role: domain.RoleDriver, CreatedBy: "another-admin"}}
		rec := callP(newAPI(fs, nil, &fakePhotos{}).UserPhotoUploadURL,
			http.MethodPost, "/admin/users/d2/photo-url", "", &adminPrincipal, map[string]string{"uid": "d2"})
		requireStatus(t, rec, http.StatusNotFound)
	})

	t.Run("records the photo only once the object is really there", func(t *testing.T) {
		fs := &fakeStore{getUser: ownDriverUser}
		ph := &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: 1024}}
		rec := callP(newAPI(fs, nil, ph).ConfirmUserPhoto,
			http.MethodPost, "/admin/users/d1/photo", "", &adminPrincipal, map[string]string{"uid": "d1"})

		requireStatus(t, rec, http.StatusOK)
		if fs.updatedUser.PhotoPath == nil {
			t.Fatal("the account was not stamped with its photo")
		}
		if got := *fs.updatedUser.PhotoPath; got != media.UserPhotoPath("d1") {
			t.Fatalf("stamped %q", got)
		}
	})

	t.Run("refuses to record a photo that was never uploaded", func(t *testing.T) {
		fs := &fakeStore{getUser: ownDriverUser}
		rec := callP(newAPI(fs, nil, &fakePhotos{}).ConfirmUserPhoto,
			http.MethodPost, "/admin/users/d1/photo", "", &adminPrincipal, map[string]string{"uid": "d1"})

		requireStatus(t, rec, http.StatusBadRequest)
		if fs.updatedUser.PhotoPath != nil {
			t.Fatal("the account was stamped anyway")
		}
	})

	t.Run("throws away an oversized upload instead of recording it", func(t *testing.T) {
		fs := &fakeStore{getUser: ownDriverUser}
		ph := &fakePhotos{meta: media.ObjectMeta{Exists: true, Size: media.MaxPhotoBytes + 1}}
		rec := callP(newAPI(fs, nil, ph).ConfirmUserPhoto,
			http.MethodPost, "/admin/users/d1/photo", "", &adminPrincipal, map[string]string{"uid": "d1"})

		requireStatus(t, rec, http.StatusBadRequest)
		if len(ph.deleted) != 1 {
			t.Fatal("the oversized object was left in the bucket")
		}
	})

	t.Run("serves the bytes, with the API's own content type", func(t *testing.T) {
		user := ownDriverUser
		user.PhotoPath = media.UserPhotoPath("d1")
		ph := &fakePhotos{body: "jpeg-bytes"}
		rec := callP(newAPI(&fakeStore{getUser: user}, nil, ph).GetUserPhoto,
			http.MethodGet, "/admin/users/d1/photo", "", &adminPrincipal, map[string]string{"uid": "d1"})

		requireStatus(t, rec, http.StatusOK)
		if rec.Body.String() != "jpeg-bytes" {
			t.Fatalf("body = %q", rec.Body.String())
		}
		if ct := rec.Header().Get("Content-Type"); ct != media.PhotoContentType {
			t.Fatalf("Content-Type = %q", ct)
		}
		if ph.openedGen != 0 {
			t.Fatalf("read generation %d, want whatever is current", ph.openedGen)
		}
	})

	t.Run("404s for an account with no photo", func(t *testing.T) {
		rec := callP(newAPI(&fakeStore{getUser: ownDriverUser}, nil, &fakePhotos{}).GetUserPhoto,
			http.MethodGet, "/admin/users/d1/photo", "", &adminPrincipal, map[string]string{"uid": "d1"})
		requireStatus(t, rec, http.StatusNotFound)
	})
}
