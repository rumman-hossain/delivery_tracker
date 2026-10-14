package domain

import (
	"encoding/json"
)

// Nullable distinguishes an absent JSON key from an explicit null, which a PATCH needs: omitting radiusM means "leave it alone", whereas `"radiusM": null` means "clear the override and fall back to the global radius".
type Nullable[T any] struct {
	Present bool
	Value   *T
}

func (n *Nullable[T]) UnmarshalJSON(b []byte) error {
	n.Present = true
	if string(b) == "null" {
		n.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	n.Value = &v
	return nil
}
