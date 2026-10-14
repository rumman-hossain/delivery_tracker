package media

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPhotoPath(t *testing.T) {
	cases := []struct {
		name   string
		tripID string
		seq    int
		want   string
	}{
		{"a shop stop", "trip-abc", 1, "trips/trip-abc/1.jpg"},
		{"a home stop uses the same shape", "trip-abc", 2, "trips/trip-abc/2.jpg"},
		{"double digits", "trip-abc", 12, "trips/trip-abc/12.jpg"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := PhotoPath(c.tripID, c.seq); got != c.want {
				t.Fatalf("PhotoPath(%q, %d) = %q, want %q", c.tripID, c.seq, got, c.want)
			}
		})
	}
}

// The path is derived from the trip and the stop, never from anything the client sends.
func TestPhotoPathIsDeterministicPerStop(t *testing.T) {
	first := PhotoPath("trip-abc", 3)
	second := PhotoPath("trip-abc", 3)
	if first != second {
		t.Fatalf("the same stop produced two paths: %q and %q", first, second)
	}
	if PhotoPath("trip-abc", 3) == PhotoPath("trip-abc", 4) {
		t.Fatal("two different stops share a path")
	}
	if PhotoPath("trip-abc", 3) == PhotoPath("trip-xyz", 3) {
		t.Fatal("the same stop on two trips shares a path")
	}
}

func TestNewRequiresABucket(t *testing.T) {
	if _, err := New(context.Background(), "", time.Minute); err == nil {
		t.Fatal("New accepted an empty bucket; signed URLs would target nothing")
	}
}

// PhotoContentType is pinned into the signature, the upload header and the stored object.
func TestPhotoContentTypeIsJPEG(t *testing.T) {
	if PhotoContentType != "image/jpeg" {
		t.Fatalf("PhotoContentType = %q; the handler and storage.rules both assume image/jpeg", PhotoContentType)
	}
}

func fakeGCS(t *testing.T, handler http.HandlerFunc) *GCS {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	t.Setenv("STORAGE_EMULATOR_HOST", strings.TrimPrefix(srv.URL, "http://"))

	g, err := New(context.Background(), "test-bucket", 5*time.Minute)
	if err != nil {
		t.Fatalf("building the client: %v", err)
	}
	t.Cleanup(func() { _ = g.Close() })
	return g
}

func TestObjectMeta(t *testing.T) {
	t.Run("an uploaded object is found", func(t *testing.T) {
		g := fakeGCS(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"name":"trips/t1/1.jpg","bucket":"test-bucket","size":"1024","generation":"1700000000000001"}`))
		})

		got, err := g.ObjectMeta(context.Background(), "trips/t1/1.jpg")
		if err != nil {
			t.Fatalf("ObjectMeta: %v", err)
		}
		if !got.Exists {
			t.Fatal("an object that exists was reported missing")
		}
		if got.Size != 1024 {
			t.Fatalf("Size = %d, want 1024", got.Size)
		}
		if got.Generation != 1700000000000001 {
			t.Fatalf("Generation = %d, want the value Storage reported", got.Generation)
		}
	})

	t.Run("a missing object is reported missing, not as an error", func(t *testing.T) {
		g := fakeGCS(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":{"code":404,"message":"Not Found"}}`))
		})

		got, err := g.ObjectMeta(context.Background(), "trips/t1/1.jpg")
		if err != nil {
			t.Fatalf("a missing object must not be an error: %v", err)
		}
		if got.Exists {
			t.Fatal("a missing object was reported as present")
		}
	})

	t.Run("a real failure is an error, not a missing object", func(t *testing.T) {
		g := fakeGCS(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":{"code":403,"message":"caller does not have storage.objects.get access"}}`))
		})

		got, err := g.ObjectMeta(context.Background(), "trips/t1/1.jpg")
		if err == nil {
			t.Fatal("a failure from Storage was reported as a clean 'missing'")
		}
		if got.Exists {
			t.Fatal("a failed check reported the object as present")
		}
	})
}

// A signed PUT cannot cap its own size, so the cap has to be a number the handler can compare against.
func TestMaxPhotoBytesIsSane(t *testing.T) {
	const mb = 1 << 20
	if MaxPhotoBytes < 4*mb {
		t.Fatalf("MaxPhotoBytes = %d; below a normal phone photo", MaxPhotoBytes)
	}
	if MaxPhotoBytes > 32*mb {
		t.Fatalf("MaxPhotoBytes = %d; too generous to be a cap", MaxPhotoBytes)
	}
}

// Deleting an object that is already gone is not a failure: the caller is trying to make sure it is absent, and it is.
func TestDeleteObjectToleratesAMissingObject(t *testing.T) {
	g := fakeGCS(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":404,"message":"Not Found"}}`))
	})
	if err := g.DeleteObject(context.Background(), "trips/t1/1.jpg"); err != nil {
		t.Fatalf("deleting an absent object should succeed: %v", err)
	}
}
