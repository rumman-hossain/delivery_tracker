package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

// Reached records one stop.
func (s *Store) Reached(ctx context.Context, tripID, driverUID, idempotencyKey string, req domain.ReachedRequest, photoGeneration int64) (*domain.ReachedResponse, error) {
	clientTime, appErr := domain.ParseClientTime(req.ClientTime)
	if appErr != nil {
		return nil, appErr
	}

	tripRef := s.c.Collection(colTrips).Doc(tripID)
	events := tripRef.Collection(colEvents)
	var out *domain.ReachedResponse

	err := s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		out = nil

		snap, err := tx.Get(tripRef)
		if err != nil {
			return notFound(err, "that trip")
		}
		trip, err := tripFrom(snap)
		if err != nil {
			return err
		}
		if trip.DriverUID != driverUID {
			return domain.Forbidden("that trip belongs to another driver")
		}
		if trip.Status != domain.TripInProgress {
			return domain.Conflict(domain.CodeTripNotActive, "start this trip before recording a stop")
		}

		replay, err := tx.Documents(events.Where("idempotencyKey", "==", idempotencyKey).Limit(1)).GetAll()
		if err != nil {
			return err
		}
		if len(replay) == 1 {
			prior, err := eventFrom(replay[0])
			if err != nil {
				return err
			}
			out = responseFor(prior)
			return nil
		}

		dupes, err := tx.Documents(events.
			Where("type", "==", string(domain.EventReached)).
			Where("seq", "==", req.Seq).
			Limit(1)).GetAll()
		if err != nil {
			return err
		}
		if len(dupes) > 0 {
			return domain.Conflict(domain.CodeAlreadyRecorded, "that stop has already been recorded")
		}

		if req.Seq != trip.CurrentStopSeq {
			return domain.Conflict(domain.CodeOutOfOrder,
				fmt.Sprintf("record stop %d before stop %d", trip.CurrentStopSeq, req.Seq))
		}

		if req.Seq < 1 || req.Seq > len(trip.RouteSnapshot.Stops) {
			return domain.BadRequest(fmt.Sprintf("this trip has no stop %d", req.Seq))
		}
		stop := trip.RouteSnapshot.Stops[req.Seq-1]

		distanceM, match := domain.JudgeCapture(stop, req.Lat, req.Lng)

		serverTime := time.Now().UTC()
		skew := serverTime.Sub(clientTime).Milliseconds()
		seq := req.Seq

		ev := domain.Event{
			Type:            domain.EventReached,
			Seq:             &seq,
			ServerTime:      serverTime,
			ClientTime:      &clientTime,
			TimeSkewMs:      &skew,
			Lat:             req.Lat,
			Lng:             req.Lng,
			AccuracyM:       req.AccuracyM,
			SampleCount:     req.SampleCount,
			Speed:           req.Speed,
			Heading:         req.Heading,
			DistanceM:       distanceM,
			MatchStatus:     match,
			DeliveryStatus:  req.DeliveryStatus,
			PhotoPath:       req.PhotoPath,
			PhotoGeneration: photoGeneration,
			Note:            strings.TrimSpace(req.Note),
			IdempotencyKey:  idempotencyKey,
			ByUID:           driverUID,
			ByRole:          domain.RoleDriver,
		}

		ref := events.NewDoc()
		if err := tx.Create(ref, ev); err != nil {
			return err
		}
		if err := tx.Update(tripRef, []firestore.Update{
			{Path: "currentStopSeq", Value: trip.CurrentStopSeq + 1},
		}); err != nil {
			return err
		}

		ev.ID = ref.ID
		out = responseFor(ev)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func responseFor(ev domain.Event) *domain.ReachedResponse {
	seq := 0
	if ev.Seq != nil {
		seq = *ev.Seq
	}
	return &domain.ReachedResponse{
		EventID:     ev.ID,
		Seq:         seq,
		ServerTime:  ev.ServerTime,
		DistanceM:   ev.DistanceM,
		MatchStatus: ev.MatchStatus,
		NextSeq:     seq + 1,
		TripStatus:  domain.TripInProgress,
	}
}

func eventFrom(snap *firestore.DocumentSnapshot) (domain.Event, error) {
	var ev domain.Event
	if err := snap.DataTo(&ev); err != nil {
		return domain.Event{}, err
	}
	ev.ID = snap.Ref.ID
	return ev, nil
}

// GetEvent returns one event.
func (s *Store) GetEvent(ctx context.Context, tripID, eventID string) (domain.Event, error) {
	snap, err := s.c.Collection(colTrips).Doc(tripID).Collection(colEvents).Doc(eventID).Get(ctx)
	if err != nil {
		return domain.Event{}, notFound(err, "that event")
	}
	return eventFrom(snap)
}

// ListEvents returns a trip's events oldest first, which is the order the admin timeline renders and the order leg durations are computed from.
func (s *Store) ListEvents(ctx context.Context, tripID string) ([]domain.Event, error) {
	it := s.c.Collection(colTrips).Doc(tripID).Collection(colEvents).
		OrderBy("serverTime", firestore.Asc).Documents(ctx)
	defer it.Stop()

	out := []domain.Event{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		ev, err := eventFrom(snap)
		if err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
}

// AppendCorrection records an admin edit.
func (s *Store) AppendCorrection(ctx context.Context, tripID string, actorUID string, actorRole domain.Role, req domain.CorrectionRequest) (string, error) {
	events := s.c.Collection(colTrips).Doc(tripID).Collection(colEvents)

	snap, err := events.Doc(req.TargetEventID).Get(ctx)
	if err != nil {
		return "", notFound(err, "that event")
	}
	target, err := eventFrom(snap)
	if err != nil {
		return "", err
	}
	if target.Type != domain.EventReached {
		return "", domain.BadRequest("only a recorded stop can be corrected")
	}

	serverTime := time.Now().UTC()

	ev := domain.Event{
		Type:           domain.EventCorrection,
		ServerTime:     serverTime,
		TargetEventID:  req.TargetEventID,
		Changes:        req.Changes,
		Reason:         req.Reason,
		ByUID:          actorUID,
		ByRole:         actorRole,
		IdempotencyKey: "correction:" + req.TargetEventID + ":" + serverTime.Format(time.RFC3339Nano),
	}
	ref, _, addErr := events.Add(ctx, ev)
	if addErr != nil {
		return "", addErr
	}
	return ref.ID, nil
}
