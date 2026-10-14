package domain

import (
	"fmt"
	"strings"
)

// ValidateShop validates both POST (create=true, name/lat/lng required) and PATCH.
func ValidateShop(req ShopRequest, create bool) *AppError {
	if create {
		if req.Name == nil || strings.TrimSpace(*req.Name) == "" {
			return BadRequest("name is required")
		}
		home := req.Kind != nil && *req.Kind == KindHome
		if !home && (req.Lat.Value == nil || req.Lng.Value == nil) {
			return BadRequest("lat and lng are required")
		}
	}
	if req.Name != nil && strings.TrimSpace(*req.Name) == "" {
		return BadRequest("name cannot be blank")
	}
	if req.Kind != nil && *req.Kind != KindShop && *req.Kind != KindWarehouse && *req.Kind != KindHome {
		return BadRequest(`kind must be "shop", "warehouse" or "home"`)
	}
	if req.Lat.Present != req.Lng.Present {
		return BadRequest("lat and lng must be sent together")
	}
	if (req.Lat.Value == nil) != (req.Lng.Value == nil) {
		return BadRequest("lat and lng must be cleared together")
	}
	if req.Lat.Value != nil && (!validLat(*req.Lat.Value) || !validLng(*req.Lng.Value)) {
		return BadRequest("lat must be within -90..90 and lng within -180..180")
	}
	if req.RadiusM.Present && req.RadiusM.Value != nil && !validRadius(*req.RadiusM.Value) {
		return BadRequest(fmt.Sprintf("radiusM must be a whole number between %.0f and %.0f, or null to use the global radius", MinRadiusM, MaxRadiusM))
	}
	return nil
}

// ValidateConfig checks the global fallback radius.
func ValidateConfig(req ConfigRequest) *AppError {
	if req.MatchRadiusM == nil {
		return BadRequest("matchRadiusM is required")
	}
	if !validRadius(*req.MatchRadiusM) {
		return BadRequest(fmt.Sprintf("matchRadiusM must be a whole number between %.0f and %.0f", MinRadiusM, MaxRadiusM))
	}
	return nil
}

// ValidateRoute enforces the stop list invariants: at least one stop, seq values 1..n contiguous and in order, shop stops carrying a shopId, home stops a label.
func ValidateRoute(req RouteRequest, create bool) *AppError {
	if create {
		if req.Name == nil || strings.TrimSpace(*req.Name) == "" {
			return BadRequest("name is required")
		}
		if req.StartPlaceID == nil {
			return BadRequest("startPlaceId is required")
		}
		if req.EndPlaceID == nil {
			return BadRequest("endPlaceId is required")
		}
		if req.Stops == nil {
			return BadRequest("stops is required")
		}
	}
	if req.Name != nil && strings.TrimSpace(*req.Name) == "" {
		return BadRequest("name cannot be blank")
	}
	if req.StartPlaceID != nil && strings.TrimSpace(*req.StartPlaceID) == "" {
		return BadRequest("startPlaceId cannot be blank")
	}
	if req.EndPlaceID != nil && strings.TrimSpace(*req.EndPlaceID) == "" {
		return BadRequest("endPlaceId cannot be blank")
	}
	if req.Stops == nil {
		return nil
	}
	if len(req.Stops) == 0 {
		return BadRequest("a route needs at least one stop")
	}
	return validateStopShapes(req.Stops)
}

func validateStopShapes(stops []Stop) *AppError {
	seen := map[string]int{}

	for i, s := range stops {
		if s.Seq != i+1 {
			return BadRequest(fmt.Sprintf("stop seq values must be 1..%d in order; got %d at position %d", len(stops), s.Seq, i+1))
		}
		switch s.Type {
		case StopShop:
			if strings.TrimSpace(s.ShopID) == "" {
				return BadRequest(fmt.Sprintf("stop %d is a shop stop and needs a shopId", s.Seq))
			}
			shopID := strings.TrimSpace(s.ShopID)
			if first, dup := seen[shopID]; dup {
				return BadRequest(fmt.Sprintf("stops %d and %d are the same place; a route calls at each place once", first, s.Seq))
			}
			seen[shopID] = s.Seq
		case StopHome:
			if strings.TrimSpace(s.Label) == "" {
				return BadRequest(fmt.Sprintf("stop %d is a home stop and needs a label", s.Seq))
			}
		default:
			return BadRequest(fmt.Sprintf(`stop %d has type %q; must be "shop" or "home"`, s.Seq, s.Type))
		}
	}
	return nil
}
