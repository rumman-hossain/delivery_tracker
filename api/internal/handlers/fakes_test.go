package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

type fakeStore struct {
	mu sync.Mutex

	putUserErr  error
	putUserUID  string
	putUser     domain.User
	getUserUID  string
	getUser     domain.User
	getUserErr  error
	listUsers   []domain.User
	listUsersBy domain.Role
	updateUser  error
	updatedUser domain.UpdateUserRequest

	createShopID  string
	createShopErr error
	listShops     []domain.Shop
	updateShopErr error

	createRouteID  string
	createRouteErr error
	getRoute       domain.Route
	getRouteErr    error
	listRoutes     []domain.Route
	updateRouteErr error

	config       domain.AppConfig
	getConfigErr error
	setConfigTo  float64
	setConfigErr error

	assignTripID       string
	assignedTrip       *domain.AssignTripRequest
	assignTripErr      error
	getTrip            domain.Trip
	getTripErr         error
	listTrips          []domain.Trip
	listTripsWith      store.TripFilters
	listTripsErr       error
	listTripsTruncated bool
	rangeTrips         []domain.Trip
	rangeFrom          string
	rangeTo            string
	rangeErr           error
	driverTrips        []domain.Trip
	driverTripsErr     error

	startStatus domain.TripStatus
	startSeq    int
	startErr    error
	startUID    string
	completeUID string
	reached     *domain.ReachedResponse
	reachedErr  error
	reachedWith struct {
		tripID, driverUID, key string
		req                    domain.ReachedRequest
		generation             int64
	}
	completeStatus domain.TripStatus
	completeErr    error

	events           []domain.Event
	eventsErr        error
	eventsCalls      int
	history          []domain.Trip
	historyTruncated bool
	historyErr       error
	historyLimit     int

	reassignedTo   string
	reassignedTrip domain.Trip
	reassignErr    error

	editedStops  *domain.EditTripStopsRequest
	editedByUID  string
	editedByRole domain.Role
	editedTrip   domain.Trip
	editStopsErr error

	correctionByUID  string
	correctionByRole domain.Role
	correctionID     string
	correctionErr    error
}

func (f *fakeStore) PutUser(_ context.Context, uid string, u domain.User) error {
	f.mu.Lock()
	f.putUserUID, f.putUser = uid, u
	f.mu.Unlock()
	return f.putUserErr
}
func (f *fakeStore) GetUser(_ context.Context, uid string) (domain.User, error) {
	f.mu.Lock()
	f.getUserUID = uid
	f.mu.Unlock()
	return f.getUser, f.getUserErr
}
func (f *fakeStore) ListUsers(_ context.Context, role domain.Role) ([]domain.User, error) {
	f.mu.Lock()
	f.listUsersBy = role
	f.mu.Unlock()
	return f.listUsers, nil
}
func (f *fakeStore) UpdateUser(_ context.Context, _ string, req domain.UpdateUserRequest) error {
	f.mu.Lock()
	f.updatedUser = req
	f.mu.Unlock()
	return f.updateUser
}

func (f *fakeStore) CreateShop(context.Context, domain.ShopRequest) (string, error) {
	return f.createShopID, f.createShopErr
}
func (f *fakeStore) ListShops(context.Context) ([]domain.Shop, error) { return f.listShops, nil }
func (f *fakeStore) UpdateShop(context.Context, string, domain.ShopRequest) error {
	return f.updateShopErr
}

func (f *fakeStore) CreateRoute(context.Context, domain.RouteRequest) (string, error) {
	return f.createRouteID, f.createRouteErr
}
func (f *fakeStore) GetRoute(context.Context, string) (domain.Route, error) {
	return f.getRoute, f.getRouteErr
}
func (f *fakeStore) ListRoutes(context.Context) ([]domain.Route, error) { return f.listRoutes, nil }
func (f *fakeStore) UpdateRoute(context.Context, string, domain.RouteRequest) error {
	return f.updateRouteErr
}

func (f *fakeStore) GetConfig(context.Context) (domain.AppConfig, error) {
	return f.config, f.getConfigErr
}
func (f *fakeStore) SetConfig(_ context.Context, r float64) error {
	f.mu.Lock()
	f.setConfigTo = r
	f.mu.Unlock()
	return f.setConfigErr
}

func (f *fakeStore) AssignTrip(_ context.Context, req domain.AssignTripRequest) (string, error) {
	f.mu.Lock()
	f.assignedTrip = &req
	f.mu.Unlock()
	return f.assignTripID, f.assignTripErr
}
func (f *fakeStore) GetTrip(context.Context, string) (domain.Trip, error) {
	return f.getTrip, f.getTripErr
}
func (f *fakeStore) ListTrips(_ context.Context, filters store.TripFilters) ([]domain.Trip, bool, error) {
	f.mu.Lock()
	f.listTripsWith = filters
	f.mu.Unlock()
	return f.listTrips, f.listTripsTruncated, f.listTripsErr
}
func (f *fakeStore) ListTripsInDateRange(_ context.Context, from, to string) ([]domain.Trip, error) {
	f.mu.Lock()
	f.rangeFrom, f.rangeTo = from, to
	f.mu.Unlock()
	return f.rangeTrips, f.rangeErr
}
func (f *fakeStore) ListDriverTrips(context.Context, string) ([]domain.Trip, error) {
	return f.driverTrips, f.driverTripsErr
}

func (f *fakeStore) StartTrip(_ context.Context, _, driverUID string, _ domain.BaseCapture) (domain.TripStatus, int, error) {
	f.mu.Lock()
	f.startUID = driverUID
	f.mu.Unlock()
	return f.startStatus, f.startSeq, f.startErr
}
func (f *fakeStore) Reached(_ context.Context, tripID, driverUID, key string, req domain.ReachedRequest, generation int64) (*domain.ReachedResponse, error) {
	f.mu.Lock()
	f.reachedWith.tripID, f.reachedWith.driverUID, f.reachedWith.key, f.reachedWith.req = tripID, driverUID, key, req
	f.reachedWith.generation = generation
	f.mu.Unlock()
	return f.reached, f.reachedErr
}
func (f *fakeStore) CompleteTrip(_ context.Context, _, driverUID string, _ domain.BaseCapture) (domain.TripStatus, error) {
	f.mu.Lock()
	f.completeUID = driverUID
	f.mu.Unlock()
	return f.completeStatus, f.completeErr
}

// GetEvent answers from the same slice ListEvents does, so a test that sets up a timeline gets a consistent answer from both doors.
func (f *fakeStore) ListDriverHistory(_ context.Context, _ string, limit int) ([]domain.Trip, bool, error) {
	f.mu.Lock()
	f.historyLimit = limit
	f.mu.Unlock()
	return f.history, f.historyTruncated, f.historyErr
}

func (f *fakeStore) ReassignTrip(_ context.Context, _ string, driver domain.User) (domain.Trip, error) {
	f.mu.Lock()
	f.reassignedTo = driver.UID
	f.mu.Unlock()
	return f.reassignedTrip, f.reassignErr
}

func (f *fakeStore) GetEvent(_ context.Context, _, eventID string) (domain.Event, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.eventsErr != nil {
		return domain.Event{}, f.eventsErr
	}
	for _, ev := range f.events {
		if ev.ID == eventID {
			return ev, nil
		}
	}
	return domain.Event{}, domain.NotFound("that event")
}

func (f *fakeStore) ListEvents(context.Context, string) ([]domain.Event, error) {
	f.mu.Lock()
	f.eventsCalls++
	f.mu.Unlock()
	return f.events, f.eventsErr
}
func (f *fakeStore) EditTripStops(_ context.Context, _, actorUID string, actorRole domain.Role, req domain.EditTripStopsRequest) (domain.Trip, error) {
	f.mu.Lock()
	f.editedStops, f.editedByUID, f.editedByRole = &req, actorUID, actorRole
	f.mu.Unlock()
	return f.editedTrip, f.editStopsErr
}

func (f *fakeStore) AppendCorrection(_ context.Context, _ string, actorUID string, actorRole domain.Role, _ domain.CorrectionRequest) (string, error) {
	f.mu.Lock()
	f.correctionByUID, f.correctionByRole = actorUID, actorRole
	f.mu.Unlock()
	return f.correctionID, f.correctionErr
}

type fakeProvisioner struct {
	mu sync.Mutex

	createUID    string
	createErr    error
	created      *domain.CreateUserRequest
	deleted      string
	setActiveTo  *bool
	setActiveErr error

	resetUID string
	resetTo  string
	resetErr error
}

func (f *fakeProvisioner) Create(_ context.Context, req domain.CreateUserRequest) (string, error) {
	f.mu.Lock()
	f.created = &req
	f.mu.Unlock()
	return f.createUID, f.createErr
}
func (f *fakeProvisioner) Delete(_ context.Context, uid string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = uid
	return nil
}
func (f *fakeProvisioner) ResetPassword(_ context.Context, uid, newPassword string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.resetUID, f.resetTo = uid, newPassword
	return f.resetErr
}
func (f *fakeProvisioner) SetActive(_ context.Context, _ string, active bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.setActiveTo = &active
	return f.setActiveErr
}

type fakePhotos struct {
	uploadURL string
	expires   time.Time
	uploadErr error

	body      string
	bodyInfo  media.ObjectInfo
	openErr   error
	openedGen int64
	opened    string

	meta    media.ObjectMeta
	metaErr error

	mu      sync.Mutex
	deleted []string
}

func (f *fakePhotos) SignedUploadURL(context.Context, string) (string, time.Time, error) {
	return f.uploadURL, f.expires, f.uploadErr
}
func (f *fakePhotos) OpenObject(_ context.Context, object string, generation int64) (io.ReadCloser, media.ObjectInfo, error) {
	f.mu.Lock()
	f.opened, f.openedGen = object, generation
	f.mu.Unlock()
	if f.openErr != nil {
		return nil, media.ObjectInfo{}, f.openErr
	}
	info := f.bodyInfo
	if info.Size == 0 {
		info.Size = int64(len(f.body))
	}
	return io.NopCloser(strings.NewReader(f.body)), info, nil
}
func (f *fakePhotos) ObjectMeta(context.Context, string) (media.ObjectMeta, error) {
	return f.meta, f.metaErr
}

func (f *fakePhotos) DeleteObject(_ context.Context, object string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, object)
	return nil
}

func newAPI(s *fakeStore, p *fakeProvisioner, ph *fakePhotos) *API {
	if s == nil {
		s = &fakeStore{}
	}
	if p == nil {
		p = &fakeProvisioner{}
	}
	if ph == nil {
		ph = &fakePhotos{}
	}
	return &API{Store: s, Provisioner: p, Photos: ph}
}

func call(h http.HandlerFunc, method, target, body string, p *auth.Principal) *httptest.ResponseRecorder {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	if p != nil {
		r = r.WithContext(auth.WithPrincipal(r.Context(), *p))
	}
	rec := httptest.NewRecorder()
	h(rec, r)
	return rec
}

var (
	superadminPrincipal = auth.Principal{UID: "super-1", Role: domain.RoleSuperadmin}
	adminPrincipal      = auth.Principal{UID: "admin-1", Role: domain.RoleAdmin}
	driverPrincipal     = auth.Principal{UID: "driver-1", Role: domain.RoleDriver}
)

func errCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("body is not the error envelope: %v (%q)", err, rec.Body.String())
	}
	if env.Error.Message == "" {
		t.Errorf("error envelope carries no message: %q", rec.Body.String())
	}
	return env.Error.Code
}

func decode(t *testing.T, rec *httptest.ResponseRecorder, into any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), into); err != nil {
		t.Fatalf("decoding response: %v (%q)", err, rec.Body.String())
	}
}

func requireStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d (body %q)", rec.Code, want, rec.Body.String())
	}
}

func callP(h http.HandlerFunc, method, target, body string, p *auth.Principal, params map[string]string) *httptest.ResponseRecorder {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	if p != nil {
		r = r.WithContext(auth.WithPrincipal(r.Context(), *p))
	}
	rc := chi.NewRouteContext()
	for k, v := range params {
		rc.URLParams.Add(k, v)
	}
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))

	rec := httptest.NewRecorder()
	h(rec, r)
	return rec
}

func callIdem(h http.HandlerFunc, method, target, body string, p *auth.Principal, params map[string]string, key string) *httptest.ResponseRecorder {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	r.Header.Set(IdempotencyHeader, key)
	if p != nil {
		r = r.WithContext(auth.WithPrincipal(r.Context(), *p))
	}
	rc := chi.NewRouteContext()
	for k, v := range params {
		rc.URLParams.Add(k, v)
	}
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))

	rec := httptest.NewRecorder()
	h(rec, r)
	return rec
}
