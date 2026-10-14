package domain

import (
	"fmt"
	"strings"
	"time"
)

// ValidateEditTripStops checks a replacement for a trip's pending tail.
func ValidateEditTripStops(req EditTripStopsRequest) *AppError {
	if strings.TrimSpace(req.Reason) == "" {
		return BadRequest("say why the route is changing")
	}
	if req.FromStopSeq < 1 {
		return BadRequest("fromStopSeq is required, so a stale edit cannot be applied")
	}
	return validateStopShapes(req.Stops)
}

// ValidateAssignTrip checks the assign payload.
func ValidateAssignTrip(req AssignTripRequest) *AppError {
	if strings.TrimSpace(req.RouteID) == "" {
		return BadRequest("routeId is required")
	}
	if strings.TrimSpace(req.DriverUID) == "" {
		return BadRequest("driverUid is required")
	}
	if _, err := time.Parse(DateLayout, req.AssignedDate); err != nil {
		return BadRequest("assignedDate must be a YYYY-MM-DD date")
	}
	return nil
}

// CorrectableFields are the event fields an admin correction may amend.
var CorrectableFields = map[string]bool{
	"deliveryStatus": true,
	"matchStatus":    true,
	"distanceM":      true,
	"lat":            true,
	"lng":            true,
	"accuracyM":      true,
}

// ValidateCorrection checks an admin's amendment to a recorded event.
func ValidateCorrection(req CorrectionRequest) *AppError {
	if strings.TrimSpace(req.TargetEventID) == "" {
		return BadRequest("targetEventId is required")
	}
	if strings.TrimSpace(req.Reason) == "" {
		return BadRequest("a reason is required for every correction")
	}
	if len(req.Changes) == 0 {
		return BadRequest("changes cannot be empty")
	}
	for k := range req.Changes {
		if !CorrectableFields[k] {
			return BadRequest(fmt.Sprintf("%q is not a correctable field", k))
		}
	}
	return nil
}
