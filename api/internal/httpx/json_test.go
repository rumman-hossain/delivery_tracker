package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

type payload struct {
	Seq  int    `json:"seq"`
	Note string `json:"note"`
}

func post(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
}

func TestDecodeJSON(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
		want    payload
	}{
		{name: "a well-formed object", body: `{"seq":1,"note":"ok"}`, want: payload{Seq: 1, Note: "ok"}},
		{name: "absent fields keep their zero values", body: `{}`, want: payload{}},

		{name: "an unknown field is refused", body: `{"seq":1,"notee":"typo"}`, wantErr: true},

		{name: "a wrong type is refused", body: `{"seq":"two"}`, wantErr: true},
		{name: "truncated JSON is refused", body: `{"seq":1`, wantErr: true},
		{name: "an empty body is refused", body: ``, wantErr: true},
		{name: "a bare array is refused", body: `[1,2,3]`, wantErr: true},

		{name: "a second object is refused", body: `{"seq":1}{"seq":2}`, wantErr: true},

		{name: "trailing whitespace is tolerated", body: "{\"seq\":1}\n  \n", want: payload{Seq: 1}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got payload
			err := DecodeJSON(post(c.body), &got)

			if c.wantErr {
				if err == nil {
					t.Fatalf("DecodeJSON(%q) = nil, want an error", c.body)
				}
				if err.Code != domain.CodeBadRequest {
					t.Fatalf("code = %q, want BAD_REQUEST", err.Code)
				}
				return
			}
			if err != nil {
				t.Fatalf("DecodeJSON(%q): %v", c.body, err)
			}
			if got != c.want {
				t.Fatalf("decoded %+v, want %+v", got, c.want)
			}
		})
	}
}

// Bodies are capped because captures are small JSON documents -- photos never travel through the API, they go to Storage via a signed URL.
func TestDecodeJSONCapsTheBodySize(t *testing.T) {
	oversized := fmt.Sprintf(`{"seq":1,"note":%q}`, strings.Repeat("x", 2<<20))

	var got payload
	err := DecodeJSON(post(oversized), &got)
	if err == nil {
		t.Fatal("a 2 MiB body was accepted")
	}
	if err.Code != domain.CodeBadRequest {
		t.Fatalf("code = %q, want BAD_REQUEST", err.Code)
	}
	if !strings.Contains(err.Message, "too large") {
		t.Fatalf("message = %q, want it to say the body is too large", err.Message)
	}
}

// The decoder's own message names the Go struct and field.
func TestDecodeJSONDoesNotLeakInternals(t *testing.T) {
	var got payload
	err := DecodeJSON(post(`{"seq":"two"}`), &got)
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, leak := range []string{"payload", "Seq", "struct", "Go "} {
		if strings.Contains(err.Message, leak) {
			t.Fatalf("message %q leaks %q", err.Message, leak)
		}
	}
}

func TestWriteErrorAlwaysProducesTheEnvelope(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   domain.Code
	}{
		{"a typed app error keeps its code", domain.NotFound("that trip"), http.StatusNotFound, domain.CodeNotFound},
		{"a lifecycle conflict keeps its code", domain.Conflict(domain.CodeOutOfOrder, "nope"), http.StatusConflict, domain.CodeOutOfOrder},
		{"a wrapped app error is still recognised", fmt.Errorf("store: %w", domain.Forbidden("nope")), http.StatusForbidden, domain.CodeForbidden},
		{"an unknown error becomes a generic 500", errors.New("firestore exploded"), http.StatusInternalServerError, domain.CodeInternal},
		{"a nil error becomes a generic 500", nil, http.StatusInternalServerError, domain.CodeInternal},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			WriteError(rec, httptest.NewRequest(http.MethodGet, "/x", nil), c.err)

			if rec.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, c.wantStatus)
			}
			var env errorEnvelope
			if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
				t.Fatalf("body is not the envelope: %v (%q)", err, rec.Body.String())
			}
			if env.Error.Code != c.wantCode {
				t.Fatalf("code = %q, want %q", env.Error.Code, c.wantCode)
			}
			if env.Error.Message == "" {
				t.Fatal("the envelope carries no message")
			}
			if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Fatalf("content-type = %q", ct)
			}
		})
	}
}

// An unrecognised error must never put its own text in front of a client: it can carry database detail, internal ids, or an upstream provider's message.
func TestWriteErrorDoesNotLeakUnknownErrors(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, httptest.NewRequest(http.MethodGet, "/x", nil),
		errors.New("firestore: project secret-project-123 permission denied for service account"))

	body := rec.Body.String()
	for _, leak := range []string{"secret-project-123", "service account", "firestore"} {
		if strings.Contains(body, leak) {
			t.Fatalf("response leaks %q: %s", leak, body)
		}
	}
}

func TestWriteJSONOmitsABodyForNilPayloads(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, http.StatusNoContent, nil)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", rec.Body.String())
	}
}
