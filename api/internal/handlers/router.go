package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/httpx"
)

// Router wires the whole API.
type RouterOptions struct {
	AllowedOrigins  []string
	RateLimitPerIP  int
	RateLimitPerUID int
}

func uidKey(r *http.Request) string {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		return ""
	}
	return p.UID
}

func Router(a *API, verifier auth.TokenVerifier, opts RouterOptions) http.Handler {
	r := chi.NewRouter()

	r.Use(httpx.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(httpx.RateLimit(httpx.NewLimiter(opts.RateLimitPerIP), httpx.ClientIPKey))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   opts.AllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodOptions},
		AllowedHeaders:   []string{"Authorization", "Content-Type", IdempotencyHeader, httpx.RequestIDHeader},
		ExposedHeaders:   []string{httpx.RequestIDHeader, "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	health := func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
	r.Get("/health", health)
	r.Get("/healthz", health)

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(verifier))

		r.Use(httpx.RateLimit(httpx.NewLimiter(opts.RateLimitPerUID), uidKey))

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireRole(domain.RoleAdmin, domain.RoleSuperadmin))

			r.Route("/admin", func(r chi.Router) {
				r.Post("/users", a.CreateUser)
				r.Get("/users", a.ListUsers)
				r.Patch("/users/{uid}", a.UpdateUser)
				r.Post("/users/{uid}/password", a.ResetUserPassword)
				r.Post("/users/{uid}/photo-url", a.UserPhotoUploadURL)
				r.Post("/users/{uid}/photo", a.ConfirmUserPhoto)
				r.Get("/users/{uid}/photo", a.GetUserPhoto)

				r.Post("/shops", a.CreateShop)
				r.Get("/shops", a.ListShops)
				r.Patch("/shops/{id}", a.UpdateShop)

				r.Get("/config", a.GetConfig)
				r.Patch("/config", a.UpdateConfig)

				r.Post("/routes", a.CreateRoute)
				r.Get("/routes", a.ListRoutes)
				r.Get("/routes/{id}", a.GetRoute)
				r.Patch("/routes/{id}", a.UpdateRoute)

				r.Post("/trips", a.AssignTrip)
				r.Get("/trips", a.ListTrips)
				r.Get("/trips/{id}", a.GetTrip)
				r.Get("/trips/{id}/events/{eventId}/photo", a.GetEventPhoto)
				r.Post("/trips/{id}/corrections", a.CreateCorrection)
				r.Patch("/trips/{id}/stops", a.EditTripStops)
				r.Patch("/trips/{id}/driver", a.ReassignTrip)

				r.Get("/reports/trips.csv", a.ReportCSV)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireRole(domain.RoleDriver))

			r.Get("/me", a.Me)
			r.Get("/me/trips", a.MyTrips)
			r.Get("/me/trips/history", a.MyHistory)
			r.Get("/me/trips/{id}", a.MyTrip)
			r.Post("/me/trips/{id}/start", a.StartTrip)
			r.Get("/me/trips/{id}/next", a.NextStop)
			r.Post("/me/trips/{id}/photo-url", a.PhotoURL)
			r.Post("/me/trips/{id}/reached", a.Reached)
			r.Post("/me/trips/{id}/complete", a.CompleteTrip)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, r, domain.NotFound("that endpoint"))
	})

	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, r, domain.BadRequest("that method is not allowed on this endpoint"))
	})

	return r
}
