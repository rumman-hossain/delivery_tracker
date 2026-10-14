package handlers

import (
	"net/http"
	"testing"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

func TestCreateCorrection(t *testing.T) {
	const good = `{"targetEventId":"ev1","reason":"driver reported wrong status","changes":{"deliveryStatus":"failed"}}`

	t.Run("a well-formed correction is appended", func(t *testing.T) {
		fs := &fakeStore{
			correctionID: "ev2",
			getTrip:      domain.Trip{ID: "t1", DriverUID: "d1"},
			getUser:      ownDriver,
		}
		rec := callP(newAPI(fs, nil, nil).CreateCorrection, http.MethodPost, "/admin/trips/t1/corrections", good,
			&adminPrincipal, map[string]string{"id": "t1"})
		requireStatus(t, rec, http.StatusCreated)
	})

	cases := []struct {
		name string
		body string
	}{
		{"no target event", `{"reason":"x","changes":{"deliveryStatus":"failed"}}`},
		{"no reason", `{"targetEventId":"ev1","changes":{"deliveryStatus":"failed"}}`},
		{"no changes", `{"targetEventId":"ev1","reason":"x","changes":{}}`},
		{"an uncorrectable field", `{"targetEventId":"ev1","reason":"x","changes":{"photoPath":"other.jpg"}}`},
		{"a field that does not exist", `{"targetEventId":"ev1","reason":"x","changes":{"nonsense":1}}`},
	}
	for _, c := range cases {
		t.Run(c.name+" is refused", func(t *testing.T) {
			rec := callP(newAPI(nil, nil, nil).CreateCorrection, http.MethodPost, "/admin/trips/t1/corrections", c.body,
				&adminPrincipal, map[string]string{"id": "t1"})
			requireStatus(t, rec, http.StatusBadRequest)
		})
	}
}

// A superadmin's correction is recorded with the superadmin role.
func TestCorrectionRecordsTheRealRole(t *testing.T) {
	ownTrip := domain.Trip{ID: "t1", DriverUID: "d1"}

	for _, actor := range []auth.Principal{adminPrincipal, superadminPrincipal} {
		t.Run(string(actor.Role), func(t *testing.T) {
			fs := &fakeStore{correctionID: "corr-1", getTrip: ownTrip, getUser: ownDriver}
			p := actor
			rec := callP(newAPI(fs, nil, nil).CreateCorrection, http.MethodPost, "/admin/trips/t1/corrections",
				`{"targetEventId":"ev-1","changes":{"matchStatus":"matched"},"reason":"pin was wrong"}`,
				&p, map[string]string{"id": "t1"})

			requireStatus(t, rec, http.StatusCreated)
			if fs.correctionByRole != actor.Role {
				t.Fatalf("byRole = %q, want %q", fs.correctionByRole, actor.Role)
			}
		})
	}
}
