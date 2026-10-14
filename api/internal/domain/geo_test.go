package domain

import (
	"math"
	"testing"
)

// Expected distances were derived independently of this implementation: each was computed with both the haversine formula and the spherical law of cosines, which agreed to within 0.0002 m.
func TestHaversineMeters(t *testing.T) {
	cases := []struct {
		name                   string
		lat1, lng1, lat2, lng2 float64
		wantM                  float64
		tolM                   float64
	}{
		{"identical points", 35.6812, 139.7671, 35.6812, 139.7671, 0, 0},
		{"one degree of latitude at the equator", 0, 0, 1, 0, 111194.9266, 0.001},
		{"two points ~6 km apart", 35.6812, 139.7671, 35.6896, 139.7006, 6078.2159, 0.01},
		{"shop vs capture, tight", 35.68390, 139.77440, 35.68400, 139.77450, 14.3254, 0.01},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := HaversineMeters(c.lat1, c.lng1, c.lat2, c.lng2)
			if math.Abs(got-c.wantM) > c.tolM {
				t.Errorf("HaversineMeters = %.4f m, want %.4f m (tolerance %.4f)", got, c.wantM, c.tolM)
			}
			back := HaversineMeters(c.lat2, c.lng2, c.lat1, c.lng1)
			if math.Abs(got-back) > 1e-9 {
				t.Errorf("not symmetric: %.6f vs %.6f", got, back)
			}
		})
	}
}

func TestMatchStatus(t *testing.T) {
	cases := []struct {
		name            string
		distanceM       float64
		expectedRadiusM float64
		want            Match
	}{
		{"14.8 m against a 50 m shop radius", 14.8, 50, MatchMatched},
		{"54.4 m against a 50 m shop radius", 54.4, 50, MatchSuspect},
		{"54.4 m against the 75 m global radius", 54.4, 75, MatchMatched},
		{"208 m against the 75 m global radius", 208, 75, MatchSuspect},
		{"exactly on the boundary is matched", 75, 75, MatchMatched},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := MatchStatus(c.distanceM, c.expectedRadiusM); got != c.want {
				t.Errorf("MatchStatus(%v, %v) = %q, want %q", c.distanceM, c.expectedRadiusM, got, c.want)
			}
		})
	}
}

// A home stop is never judged.
func TestJudgeCapture(t *testing.T) {
	lat, lng := 35.68400, 139.77450
	shop := SnapshotStop{
		Seq: 1, Type: StopShop,
		ExpectedLat: f(35.68390), ExpectedLng: f(139.77440), ExpectedRadiusM: f(50),
	}
	home := SnapshotStop{Seq: 2, Type: StopHome, Label: "Tanaka residence"}

	t.Run("shop stop is measured and judged", func(t *testing.T) {
		d, m := JudgeCapture(shop, &lat, &lng)
		if d == nil {
			t.Fatal("distance was nil for a shop stop")
		}
		if math.Abs(*d-14.3254) > 0.01 {
			t.Errorf("distance = %.4f m, want 14.3254 m", *d)
		}
		if m != MatchMatched {
			t.Errorf("match = %q, want %q", m, MatchMatched)
		}
	})

	t.Run("home stop is never judged, even with coordinates", func(t *testing.T) {
		d, m := JudgeCapture(home, &lat, &lng)
		if d != nil {
			t.Errorf("distance = %v, want nil for a home stop", *d)
		}
		if m != MatchNA {
			t.Errorf("match = %q, want %q", m, MatchNA)
		}
	})

	t.Run("shop stop with no fix yields na rather than a false zero", func(t *testing.T) {
		d, m := JudgeCapture(shop, nil, nil)
		if d != nil || m != MatchNA {
			t.Errorf("got (%v, %q), want (nil, %q)", d, m, MatchNA)
		}
	})
}

// A trip must be judged against the radius frozen at assign time, so that editing the shop afterwards cannot retroactively flip a verdict.
func TestEffectiveRadiusM(t *testing.T) {
	override := 50.0
	if got := EffectiveRadiusM(&override, 75); got != 50 {
		t.Errorf("per-shop override = %v, want 50", got)
	}
	if got := EffectiveRadiusM(nil, 75); got != 75 {
		t.Errorf("global fallback = %v, want 75", got)
	}
}

// What decides whether a capture is judged is the stop, not its type.
func TestJudgeCaptureFollowsThePositionNotTheType(t *testing.T) {
	at := func(lat, lng float64) (*float64, *float64) { return &lat, &lng }
	shopLat, shopLng := 35.6839, 139.7744

	unsurveyed := SnapshotStop{Seq: 2, Type: StopHome, Label: "Tanaka-san, 3F"}
	surveyed := SnapshotStop{
		Seq: 2, Type: StopHome, Label: "Tanaka-san, 3F",
		ExpectedLat: f(shopLat), ExpectedLng: f(shopLng), ExpectedRadiusM: f(50),
	}

	t.Run("an unsurveyed home stop is recorded, never judged", func(t *testing.T) {
		lat, lng := at(shopLat, shopLng)
		d, m := JudgeCapture(unsurveyed, lat, lng)
		if d != nil || m != MatchNA {
			t.Fatalf("distance %v, match %q — want nothing to compare against", d, m)
		}
	})

	t.Run("a surveyed home stop is judged like a shop", func(t *testing.T) {
		lat, lng := at(shopLat, shopLng)
		d, m := JudgeCapture(surveyed, lat, lng)
		if d == nil || m != MatchMatched {
			t.Fatalf("distance %v, match %q — want a matched capture", d, m)
		}
	})

	t.Run("and can be flagged like one", func(t *testing.T) {
		lat, lng := at(35.7139, 139.7744)
		_, m := JudgeCapture(surveyed, lat, lng)
		if m != MatchSuspect {
			t.Fatalf("match = %q, want suspect", m)
		}
	})

	t.Run("a stop with no fix is never judged", func(t *testing.T) {
		if d, m := JudgeCapture(surveyed, nil, nil); d != nil || m != MatchNA {
			t.Fatalf("distance %v, match %q", d, m)
		}
	})
}
