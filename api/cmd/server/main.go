package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	firebase "firebase.google.com/go/v4"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/config"
	"github.com/rumman-hossain/delivery_tracker/api/internal/handlers"
	"github.com/rumman-hossain/delivery_tracker/api/internal/media"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()

	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: cfg.ProjectID})
	if err != nil {
		return err
	}
	authClient, err := app.Auth(ctx)
	if err != nil {
		return err
	}

	st, err := store.New(ctx, cfg.ProjectID, cfg.FirestoreDB)
	if err != nil {
		return err
	}
	defer st.Close()

	photos, err := media.New(ctx, cfg.StorageBucket, cfg.SignedURLTTL)
	if err != nil {
		return err
	}
	defer photos.Close()

	api := &handlers.API{
		Store:       st,
		Photos:      photos,
		Provisioner: auth.Provisioner{Admin: authClient},
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: handlers.Router(api, authClient, handlers.RouterOptions{
			AllowedOrigins:  cfg.AllowedOrigins,
			RateLimitPerIP:  cfg.RateLimitPerIP,
			RateLimitPerUID: cfg.RateLimitPerUID,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	errCh := make(chan error, 1)
	go func() {
		slog.Info("listening", "port", cfg.Port, "project", cfg.ProjectID, "emulator", cfg.UseEmulator)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case sig := <-shutdown:
		slog.Info("shutting down", "signal", sig.String())
		drainCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return srv.Shutdown(drainCtx)
	}
}
