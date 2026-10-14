package media

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"cloud.google.com/go/storage"
)

// PhotoContentType is the only type accepted for proof photos.
const PhotoContentType = "image/jpeg"

// MaxPhotoBytes caps a proof photo.
const MaxPhotoBytes int64 = 8 << 20

// GCS signs URLs against a real bucket.
type GCS struct {
	client *storage.Client
	bucket string
	ttl    time.Duration
}

func New(ctx context.Context, bucket string, ttl time.Duration) (*GCS, error) {
	if bucket == "" {
		return nil, errors.New("a storage bucket is required to sign photo URLs")
	}
	c, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("opening cloud storage: %w", err)
	}
	return &GCS{client: c, bucket: bucket, ttl: ttl}, nil
}

func (g *GCS) Close() error { return g.client.Close() }

// PhotoPath is the object a stop's photo lives at.
func PhotoPath(tripID string, seq int) string {
	return fmt.Sprintf("trips/%s/%d.jpg", tripID, seq)
}

// UserPhotoPath is the object a person's photo lives at.
func UserPhotoPath(uid string) string {
	return fmt.Sprintf("users/%s/photo.jpg", uid)
}

// SignedUploadURL returns a v4 PUT URL.
func (g *GCS) SignedUploadURL(ctx context.Context, object string) (string, time.Time, error) {
	expires := time.Now().Add(g.ttl)
	url, err := g.client.Bucket(g.bucket).SignedURL(object, &storage.SignedURLOptions{
		Scheme:      storage.SigningSchemeV4,
		Method:      "PUT",
		ContentType: PhotoContentType,
		Expires:     expires,
	})
	if err != nil {
		return "", time.Time{}, fmt.Errorf("signing the upload url: %w", err)
	}
	return url, expires, nil
}

// ErrObjectMissing says the object is not there.
var ErrObjectMissing = errors.New("the photo object does not exist")

// ObjectInfo is what a reader needs to write the response headers.
type ObjectInfo struct {
	Size int64
}

// OpenObject streams one object's bytes back.
func (g *GCS) OpenObject(ctx context.Context, object string, generation int64) (io.ReadCloser, ObjectInfo, error) {
	h := g.client.Bucket(g.bucket).Object(object)
	if generation > 0 {
		h = h.Generation(generation)
	}

	rc, err := h.NewReader(ctx)
	switch {
	case errors.Is(err, storage.ErrObjectNotExist):
		return nil, ObjectInfo{}, ErrObjectMissing
	case err != nil:
		return nil, ObjectInfo{}, fmt.Errorf("opening the photo object: %w", err)
	}

	return rc, ObjectInfo{Size: rc.Attrs.Size}, nil
}

// ObjectMeta is what the API needs to know about an uploaded photo.
type ObjectMeta struct {
	Exists     bool
	Size       int64
	Generation int64
}

// ObjectMeta confirms the client really uploaded what it claims, and reports enough to judge it.
func (g *GCS) ObjectMeta(ctx context.Context, object string) (ObjectMeta, error) {
	attrs, err := g.client.Bucket(g.bucket).Object(object).Attrs(ctx)
	switch {
	case err == nil:
		return ObjectMeta{Exists: true, Size: attrs.Size, Generation: attrs.Generation}, nil
	case errors.Is(err, storage.ErrObjectNotExist):
		return ObjectMeta{}, nil
	default:
		return ObjectMeta{}, fmt.Errorf("checking the photo object: %w", err)
	}
}

// DeleteObject removes an object.
func (g *GCS) DeleteObject(ctx context.Context, object string) error {
	if err := g.client.Bucket(g.bucket).Object(object).Delete(ctx); err != nil &&
		!errors.Is(err, storage.ErrObjectNotExist) {
		return fmt.Errorf("deleting the photo object: %w", err)
	}
	return nil
}
