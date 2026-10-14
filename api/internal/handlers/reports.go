package handlers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

var csvColumns = []string{
	"tripId", "assignedDate", "driverName", "routeId",
	"eventId", "eventType", "seq", "stopType", "stopName",
	"serverTime", "clientTime", "timeSkewMs",
	"lat", "lng", "accuracyM", "sampleCount",
	"distanceM", "matchStatus", "deliveryStatus", "photoPath",
}

const maxReportSpan = 92 * 24 * time.Hour

func (a *API) ReportCSV(w http.ResponseWriter, r *http.Request) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	for _, d := range []string{from, to} {
		if d == "" {
			httpx.WriteError(w, r, domain.BadRequest("both from and to are required, as YYYY-MM-DD"))
			return
		}
		if _, err := time.Parse(domain.DateLayout, d); err != nil {
			httpx.WriteError(w, r, domain.BadRequest("from and to must be YYYY-MM-DD dates"))
			return
		}
	}
	if from > to {
		httpx.WriteError(w, r, domain.BadRequest("from must not be after to"))
		return
	}
	fromDay, _ := time.Parse(domain.DateLayout, from)
	toDay, _ := time.Parse(domain.DateLayout, to)
	if span := toDay.Sub(fromDay); span > maxReportSpan {
		httpx.WriteError(w, r, domain.BadRequest(
			fmt.Sprintf("the range must be %d days or fewer; ask for one quarter at a time",
				int(maxReportSpan.Hours()/24))))
		return
	}

	trips, err := a.Store.ListTripsInDateRange(r.Context(), from, to)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if driver := r.URL.Query().Get("driver"); driver != "" {
		kept := trips[:0]
		for _, t := range trips {
			if t.DriverUID == driver {
				kept = append(kept, t)
			}
		}
		trips = kept
	}

	var buf bytes.Buffer
	cw := csv.NewWriter(&buf)

	if err := cw.Write(csvColumns); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	for _, trip := range trips {
		events, err := a.Store.ListEvents(r.Context(), trip.ID)
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		for _, ev := range events {
			if err := cw.Write(csvRow(trip, ev)); err != nil {
				httpx.WriteError(w, r, err)
				return
			}
		}
	}

	cw.Flush()
	if err := cw.Error(); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	name := fmt.Sprintf("trips-%s-to-%s.csv", from, to)
	if driver := safeFilenamePart(r.URL.Query().Get("driver")); driver != "" {
		name = fmt.Sprintf("trips-%s-%s-to-%s.csv", driver, from, to)
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	if _, err := w.Write(buf.Bytes()); err != nil {
		log.Printf("writing the csv report: %v", err)
	}
}

func safeFilenamePart(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return -1
		}
	}, s)
}

func csvRow(trip domain.Trip, ev domain.Event) []string {
	var stopType, stopName string
	if ev.Seq != nil && *ev.Seq >= 1 && *ev.Seq <= len(trip.RouteSnapshot.Stops) {
		stop := trip.RouteSnapshot.Stops[*ev.Seq-1]
		stopType = string(stop.Type)
		stopName = stop.ShopName
		if stopName == "" {
			stopName = stop.Label
		}
	}
	return []string{
		trip.ID, trip.AssignedDate, trip.DriverName, trip.RouteID,
		ev.ID, string(ev.Type), intStr(ev.Seq), stopType, stopName,
		ev.ServerTime.Format(time.RFC3339), timeStr(ev.ClientTime), int64Str(ev.TimeSkewMs),
		floatStr(ev.Lat), floatStr(ev.Lng), floatStr(ev.AccuracyM), intStr(ev.SampleCount),
		floatStr(ev.DistanceM), string(ev.MatchStatus), string(ev.DeliveryStatus), ev.PhotoPath,
	}
}

func intStr(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}

func int64Str(v *int64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatInt(*v, 10)
}

func floatStr(v *float64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatFloat(*v, 'f', -1, 64)
}

func timeStr(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format(time.RFC3339)
}
