package domain

// MergePendingStops keeps everything already recorded and replaces the rest.
func MergePendingStops(existing []SnapshotStop, currentStopSeq int, pending []SnapshotStop) []SnapshotStop {
	merged := make([]SnapshotStop, 0, len(existing)+len(pending))

	for _, st := range existing {
		if st.Seq < currentStopSeq {
			merged = append(merged, st)
		}
	}
	for i, st := range pending {
		st.Seq = currentStopSeq + i
		merged = append(merged, st)
	}
	return merged
}

// FirstDuplicateShop finds the first place a route calls at twice, if any.
func FirstDuplicateShop(stops []SnapshotStop, editableFrom int) (first, second int, found bool) {
	seen := map[string]int{}
	for _, st := range stops {
		if st.ShopID == "" {
			continue
		}
		if at, dup := seen[st.ShopID]; dup {
			if at >= editableFrom || st.Seq >= editableFrom {
				return at, st.Seq, true
			}
			continue
		}
		seen[st.ShopID] = st.Seq
	}
	return 0, 0, false
}
