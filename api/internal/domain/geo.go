package domain

import "math"

const earthRadiusM = 6_371_000.0

// HaversineMeters returns the great-circle distance between two WGS84 points, in metres.
func HaversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	dPhi := (lat2 - lat1) * math.Pi / 180
	dLambda := (lng2 - lng1) * math.Pi / 180

	a := math.Sin(dPhi/2)*math.Sin(dPhi/2) +
		math.Cos(phi1)*math.Cos(phi2)*math.Sin(dLambda/2)*math.Sin(dLambda/2)
	return earthRadiusM * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// MatchStatus judges a shop capture against the radius frozen into the trip snapshot.
func MatchStatus(distanceM, expectedRadiusM float64) Match {
	if distanceM <= expectedRadiusM {
		return MatchMatched
	}
	return MatchSuspect
}

// JudgeCapture resolves the distance and match verdict for one capture.
func JudgeCapture(stop SnapshotStop, lat, lng *float64) (*float64, Match) {
	if lat == nil || lng == nil || !stop.HasExpectedPosition() {
		return nil, MatchNA
	}
	d := HaversineMeters(*stop.ExpectedLat, *stop.ExpectedLng, *lat, *lng)
	return &d, MatchStatus(d, *stop.ExpectedRadiusM)
}

// EffectiveRadiusM resolves a shop's radius at assign time: its own override when set, otherwise the global fallback.
func EffectiveRadiusM(shopRadius *float64, globalRadius float64) float64 {
	if shopRadius != nil {
		return *shopRadius
	}
	return globalRadius
}
