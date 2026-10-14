package domain

// NextStop describes the one stop the driver may record next.
func (trip Trip) NextStop() NextStopResponse {
	if trip.CurrentStopSeq < 1 || trip.CurrentStopSeq > len(trip.RouteSnapshot.Stops) {
		return NextStopResponse{Done: true}
	}
	stop := trip.RouteSnapshot.Stops[trip.CurrentStopSeq-1]

	out := NextStopResponse{Seq: stop.Seq, Type: stop.Type}
	switch stop.Type {
	case StopShop:
		out.ShopName = stop.ShopName
	case StopHome:
		out.Label = stop.Label
	}

	if stop.HasExpectedPosition() {
		out.ExpectedLat, out.ExpectedLng, out.ExpectedRadiusM = stop.ExpectedLat, stop.ExpectedLng, stop.ExpectedRadiusM
	}
	return out
}
