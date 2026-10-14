package config

import (
	"strings"
	"testing"
	"time"
)

func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"GOOGLE_CLOUD_PROJECT", "FIRESTORE_DATABASE", "STORAGE_BUCKET", "PORT",
		"ALLOWED_ORIGINS", "SIGNED_URL_TTL_SECONDS", "FIRESTORE_EMULATOR_HOST",
	} {
		t.Setenv(k, "")
	}
}

func TestLoadRejectsIncompleteEnvironments(t *testing.T) {
	cases := []struct {
		name      string
		env       map[string]string
		wantInErr string
	}{
		{
			name:      "a bare environment names everything missing",
			env:       map[string]string{},
			wantInErr: "GOOGLE_CLOUD_PROJECT",
		},
		{
			name:      "a deployed environment still needs a bucket for signing",
			env:       map[string]string{"GOOGLE_CLOUD_PROJECT": "p", "ALLOWED_ORIGINS": "https://example.com"},
			wantInErr: "STORAGE_BUCKET",
		},
		{
			name: "an unreplaced placeholder is caught rather than deployed",
			env: map[string]string{
				"GOOGLE_CLOUD_PROJECT": "<<PROVIDE_LATER>>",
				"ALLOWED_ORIGINS":      "https://example.com",
				"STORAGE_BUCKET":       "b.appspot.com",
			},
			wantInErr: "placeholder",
		},
		{
			name: "a non-numeric TTL is rejected",
			env: map[string]string{
				"GOOGLE_CLOUD_PROJECT":   "p",
				"ALLOWED_ORIGINS":        "https://example.com",
				"STORAGE_BUCKET":         "b.appspot.com",
				"SIGNED_URL_TTL_SECONDS": "five minutes",
			},
			wantInErr: "SIGNED_URL_TTL_SECONDS",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clearEnv(t)
			for k, v := range c.env {
				t.Setenv(k, v)
			}
			_, err := Load()
			if err == nil {
				t.Fatal("expected Load to fail")
			}
			if !strings.Contains(err.Error(), c.wantInErr) {
				t.Errorf("error %q does not mention %q", err, c.wantInErr)
			}
		})
	}
}

func TestLoadAppliesDocumentedDefaults(t *testing.T) {
	clearEnv(t)
	t.Setenv("GOOGLE_CLOUD_PROJECT", "delivery-prod")
	t.Setenv("ALLOWED_ORIGINS", " http://localhost:5173 , https://app.example.com ")
	t.Setenv("STORAGE_BUCKET", "delivery-prod.appspot.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.FirestoreDB != "(default)" {
		t.Errorf("FirestoreDB = %q, want (default)", cfg.FirestoreDB)
	}
	if cfg.SignedURLTTL != 5*time.Minute {
		t.Errorf("SignedURLTTL = %v, want 5m", cfg.SignedURLTTL)
	}
	if len(cfg.AllowedOrigins) != 2 ||
		cfg.AllowedOrigins[0] != "http://localhost:5173" ||
		cfg.AllowedOrigins[1] != "https://app.example.com" {
		t.Errorf("AllowedOrigins = %#v; whitespace should be trimmed and empties dropped", cfg.AllowedOrigins)
	}
	if cfg.UseEmulator {
		t.Error("UseEmulator should be false without FIRESTORE_EMULATOR_HOST")
	}
}

// Locally the emulator stands in for Firestore, and there is no bucket to sign against, so the cloud-only requirements relax.
func TestLoadRelaxesForTheEmulator(t *testing.T) {
	clearEnv(t)
	t.Setenv("GOOGLE_CLOUD_PROJECT", "delivery-local")
	t.Setenv("ALLOWED_ORIGINS", "http://localhost:5173")
	t.Setenv("FIRESTORE_EMULATOR_HOST", "localhost:8085")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load with the emulator set: %v", err)
	}
	if !cfg.UseEmulator {
		t.Error("UseEmulator should be true when FIRESTORE_EMULATOR_HOST is set")
	}
}

// A bad PORT fails in Load rather than at ListenAndServe.
func TestLoadRejectsAnUnusablePort(t *testing.T) {
	for _, port := range []string{"abc", "0", "70000", "-1"} {
		t.Run(port, func(t *testing.T) {
			t.Setenv("GOOGLE_CLOUD_PROJECT", "delivery-test")
			t.Setenv("ALLOWED_ORIGINS", "http://localhost:5173")
			t.Setenv("STORAGE_BUCKET", "delivery-test-photos")
			t.Setenv("PORT", port)

			if _, err := Load(); err == nil {
				t.Fatalf("Load() accepted PORT=%q", port)
			}
		})
	}
}
