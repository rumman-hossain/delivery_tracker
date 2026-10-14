package domain

// DateLayout is the assignedDate format: a calendar day, not an instant.
const DateLayout = "2006-01-02"

func validLat(v float64) bool { return v >= -90 && v <= 90 }
func validLng(v float64) bool { return v >= -180 && v <= 180 }

func validRadius(v float64) bool {
	return v >= MinRadiusM && v <= MaxRadiusM && v == float64(int(v))
}
