package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ProjectID      string
	FirestoreDB    string
	StorageBucket  string
	Port           string
	AllowedOrigins []string
	SignedURLTTL   time.Duration
	EmulatorHost   string
	UseEmulator    bool

	RateLimitPerIP  int
	RateLimitPerUID int
}

const (
	defaultPort         = "8080"
	defaultFirestoreDB  = "(default)"
	defaultSignedURLTTL = 300
)

// Load reads the environment and validates it.
func Load() (*Config, error) {
	c := &Config{
		ProjectID:     os.Getenv("GOOGLE_CLOUD_PROJECT"),
		FirestoreDB:   envOr("FIRESTORE_DATABASE", defaultFirestoreDB),
		StorageBucket: os.Getenv("STORAGE_BUCKET"),
		Port:          envOr("PORT", defaultPort),
		EmulatorHost:  os.Getenv("FIRESTORE_EMULATOR_HOST"),
	}
	c.UseEmulator = c.EmulatorHost != ""

	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}

	ttl := defaultSignedURLTTL
	if raw := os.Getenv("SIGNED_URL_TTL_SECONDS"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("SIGNED_URL_TTL_SECONDS must be a positive integer, got %q", raw)
		}
		ttl = n
	}
	c.SignedURLTTL = time.Duration(ttl) * time.Second

	var err error
	if c.RateLimitPerIP, err = positiveEnv("RATE_LIMIT_IP_PER_MIN", 240); err != nil {
		return nil, err
	}
	if c.RateLimitPerUID, err = positiveEnv("RATE_LIMIT_UID_PER_MIN", 300); err != nil {
		return nil, err
	}

	if err := c.validate(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) validate() error {
	var missing []string
	if c.ProjectID == "" {
		missing = append(missing, "GOOGLE_CLOUD_PROJECT")
	}
	if len(c.AllowedOrigins) == 0 {
		missing = append(missing, "ALLOWED_ORIGINS")
	}
	if !c.UseEmulator && c.StorageBucket == "" {
		missing = append(missing, "STORAGE_BUCKET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	if strings.Contains(c.ProjectID, "PROVIDE_LATER") {
		return fmt.Errorf("GOOGLE_CLOUD_PROJECT is still the %q placeholder; set a real project id", c.ProjectID)
	}
	if n, err := strconv.Atoi(c.Port); err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("PORT must be a number between 1 and 65535, got %q", c.Port)
	}
	return nil
}

func positiveEnv(key string, fallback int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer, got %q", key, raw)
	}
	return n, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
