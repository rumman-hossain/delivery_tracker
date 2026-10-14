package domain

import "testing"

func TestMergePendingStops(t *testing.T) {
	recorded := []SnapshotStop{
		{Seq: 1, Type: StopShop, ShopID: "a", ShopName: "Kita-Otsuka", ExpectedLat: f(35.7342738), ExpectedRadiusM: f(75)},
		{Seq: 2, Type: StopShop, ShopID: "b", ShopName: "Komagome", ExpectedRadiusM: f(120)},
	}
	remaining := []SnapshotStop{
		{Seq: 3, Type: StopShop, ShopID: "c", ShopName: "Sugamo"},
		{Seq: 4, Type: StopHome, Label: "Sato-san"},
	}
	existing := append(append([]SnapshotStop{}, recorded...), remaining...)

	t.Run("keeps recorded stops byte for byte", func(t *testing.T) {
		got := MergePendingStops(existing, 3, []SnapshotStop{{Type: StopShop, ShopID: "z", ShopName: "Kawaguchi"}})

		for i, want := range recorded {
			if got[i] != want {
				t.Fatalf("recorded stop %d changed:\n got %+v\nwant %+v", i+1, got[i], want)
			}
		}
	})

	t.Run("numbers the new tail from the stop the driver is on", func(t *testing.T) {
		got := MergePendingStops(existing, 3, []SnapshotStop{
			{Type: StopShop, ShopID: "z", ShopName: "Kawaguchi"},
			{Type: StopHome, Label: "Tanaka-san"},
		})

		if len(got) != 4 {
			t.Fatalf("got %d stops, want 4", len(got))
		}
		if got[2].Seq != 3 || got[2].ShopName != "Kawaguchi" {
			t.Fatalf("stop 3 = %+v, want the new Kawaguchi at seq 3", got[2])
		}
		if got[3].Seq != 4 || got[3].Label != "Tanaka-san" {
			t.Fatalf("stop 4 = %+v, want Tanaka-san at seq 4", got[3])
		}
	})

	t.Run("never renumbers below the current stop", func(t *testing.T) {
		for _, tail := range [][]SnapshotStop{
			{},
			{{Type: StopShop, ShopID: "z"}},
			{{Type: StopHome, Label: "x"}, {Type: StopShop, ShopID: "y"}, {Type: StopShop, ShopID: "z"}},
		} {
			got := MergePendingStops(existing, 3, tail)
			for i, want := range recorded {
				if got[i].Seq != want.Seq || got[i].ShopID != want.ShopID {
					t.Fatalf("with tail of %d, recorded stop %d moved: %+v", len(tail), i+1, got[i])
				}
			}
		}
	})

	t.Run("emptying the tail leaves only what was recorded", func(t *testing.T) {
		got := MergePendingStops(existing, 3, nil)
		if len(got) != 2 {
			t.Fatalf("got %d stops, want the 2 recorded ones", len(got))
		}
	})

	t.Run("a trip not yet started can be rewritten entirely", func(t *testing.T) {
		got := MergePendingStops(existing, 1, []SnapshotStop{{Type: StopShop, ShopID: "z"}})
		if len(got) != 1 || got[0].Seq != 1 || got[0].ShopID != "z" {
			t.Fatalf("got %+v, want a single new stop at seq 1", got)
		}
	})

	t.Run("the result is always contiguous from 1", func(t *testing.T) {
		got := MergePendingStops(existing, 3, []SnapshotStop{
			{Type: StopShop, ShopID: "z"},
			{Type: StopShop, ShopID: "y"},
		})
		for i, st := range got {
			if st.Seq != i+1 {
				t.Fatalf("stop at index %d has seq %d; the list must stay 1..n", i, st.Seq)
			}
		}
	})
}

// The duplicate a request cannot see.
func TestFirstDuplicateShop(t *testing.T) {
	shop := func(seq int, id string) SnapshotStop {
		return SnapshotStop{Seq: seq, Type: StopShop, ShopID: id}
	}
	home := func(seq int) SnapshotStop {
		return SnapshotStop{Seq: seq, Type: StopHome, Label: "the flats on Sakura-dori"}
	}

	t.Run("a journey calling at each place once", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop([]SnapshotStop{shop(1, "a"), shop(2, "b"), home(3)}, 0); dup {
			t.Fatal("reported a duplicate where there is none")
		}
	})

	t.Run("names both stops when a recorded place is added again", func(t *testing.T) {
		first, second, dup := FirstDuplicateShop([]SnapshotStop{shop(1, "a"), shop(2, "b"), shop(3, "a")}, 0)
		if !dup {
			t.Fatal("the duplicate was not found")
		}
		if first != 1 || second != 3 {
			t.Fatalf("reported stops %d and %d, want 1 and 3", first, second)
		}
	})

	t.Run("home stops are never duplicates of each other", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop([]SnapshotStop{home(1), home(2)}, 0); dup {
			t.Fatal("two home stops were treated as one place")
		}
	})

	t.Run("a stop with no shop id is not a duplicate", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop([]SnapshotStop{shop(1, ""), shop(2, "")}, 0); dup {
			t.Fatal("empty ids were matched against each other")
		}
	})

	t.Run("an empty journey has no duplicates", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop(nil, 0); dup {
			t.Fatal("found a duplicate in nothing")
		}
	})
}

// A duplicate buried in the stops the driver has already recorded is nobody's to fix.
func TestFirstDuplicateShopIgnoresWhatNobodyCanEdit(t *testing.T) {
	shop := func(seq int, id string) SnapshotStop {
		return SnapshotStop{Seq: seq, Type: StopShop, ShopID: id}
	}
	recorded := []SnapshotStop{shop(1, "a"), shop(2, "a"), shop(3, "b")}

	t.Run("both stops already recorded", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop(recorded, 3); dup {
			t.Fatal("refused an edit over two stops the caller cannot change")
		}
	})

	t.Run("one of them still pending", func(t *testing.T) {
		if _, second, dup := FirstDuplicateShop(recorded, 2); !dup || second != 2 {
			t.Fatalf("dup=%v second=%d, want the pending stop 2 reported", dup, second)
		}
	})
}

// A registered home delivery is a place, and a round calls at each place once.
func TestFirstDuplicateShopSeesRegisteredHomeDeliveries(t *testing.T) {
	home := func(seq int, id string) SnapshotStop {
		return SnapshotStop{Seq: seq, Type: StopHome, ShopID: id, Label: "Tanaka-san, 3F"}
	}
	adHoc := func(seq int) SnapshotStop {
		return SnapshotStop{Seq: seq, Type: StopHome, Label: "the flats on Sakura-dori"}
	}

	t.Run("the same doorstep twice is a duplicate", func(t *testing.T) {
		first, second, dup := FirstDuplicateShop([]SnapshotStop{home(1, "h1"), adHoc(2), home(3, "h1")}, 0)
		if !dup || first != 1 || second != 3 {
			t.Fatalf("dup=%v first=%d second=%d, want stops 1 and 3", dup, first, second)
		}
	})

	t.Run("two ad-hoc labels are still two real stops", func(t *testing.T) {
		if _, _, dup := FirstDuplicateShop([]SnapshotStop{adHoc(1), adHoc(2)}, 0); dup {
			t.Fatal("labels with no place behind them were matched against each other")
		}
	})

	t.Run("a home delivery and a shop are different places", func(t *testing.T) {
		shop := SnapshotStop{Seq: 2, Type: StopShop, ShopID: "s1"}
		if _, _, dup := FirstDuplicateShop([]SnapshotStop{home(1, "h1"), shop}, 0); dup {
			t.Fatal("two different places were called a duplicate")
		}
	})
}
