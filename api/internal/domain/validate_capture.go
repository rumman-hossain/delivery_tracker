package domain

import (
	"fmt"
	"strings"
	"time"
)

func validDelivery(d Delivery) bool {
	switch d {
	case DeliveryDelivered, DeliveryPartial, DeliveryFailed:
		return true
	}
	return false
}

// ParseClientTime parses the advisory client clock.
func ParseClientTime(s string) (time.Time, *AppError) {
	if strings.TrimSpace(s) == "" {
		return time.Time{}, BadRequest("clientTime is required")
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, BadRequest("clientTime must be an RFC3339 timestamp")
	}
	return t, nil
}

// ValidateReached checks a capture against the stop it claims to record.
func ValidateReached(req ReachedRequest, stop SnapshotStop) *AppError {
	if req.Seq <= 0 {
		return BadRequest("seq must be a positive integer")
	}
	if req.Seq != stop.Seq {
		return BadRequest(fmt.Sprintf("seq %d does not match the stop being recorded (%d)", req.Seq, stop.Seq))
	}
	if !validDelivery(req.DeliveryStatus) {
		return BadRequest(`deliveryStatus must be one of "delivered", "partial", "failed"`)
	}
	if _, err := ParseClientTime(req.ClientTime); err != nil {
		return err
	}

	if req.Lat == nil || req.Lng == nil {
		return BadRequest("lat and lng are required at every stop")
	}
	if !validLat(*req.Lat) || !validLng(*req.Lng) {
		return BadRequest("lat must be within -90..90 and lng within -180..180")
	}

	switch stop.Type {
	case StopShop:
		if strings.TrimSpace(req.PhotoPath) == "" {
			return BadRequest("photoPath is required at a shop stop")
		}
	case StopHome:
	default:
		return Internal(fmt.Sprintf("unknown stop type %q in trip snapshot", stop.Type))
	}

	if req.AccuracyM != nil && *req.AccuracyM < 0 {
		return BadRequest("accuracyM cannot be negative")
	}
	if req.SampleCount != nil && *req.SampleCount < 0 {
		return BadRequest("sampleCount cannot be negative")
	}
	if len([]rune(req.Note)) > MaxNoteRunes {
		return BadRequest(fmt.Sprintf("the note must be %d characters or fewer", MaxNoteRunes))
	}
	return nil
}

// MaxNoteRunes caps the driver's own account of a stop.
const MaxNoteRunes = 280

// ValidateBaseCapture checks the best-effort GPS sent with START and COMPLETE.
func ValidateBaseCapture(c BaseCapture) *AppError {
	if _, err := ParseClientTime(c.ClientTime); err != nil {
		return err
	}
	if (c.Lat == nil) != (c.Lng == nil) {
		return BadRequest("lat and lng must be sent together")
	}
	if c.Lat != nil && (!validLat(*c.Lat) || !validLng(*c.Lng)) {
		return BadRequest("lat must be within -90..90 and lng within -180..180")
	}
	if c.AccuracyM != nil && *c.AccuracyM < 0 {
		return BadRequest("accuracyM cannot be negative")
	}
	return nil
}
