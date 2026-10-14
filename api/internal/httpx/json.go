package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
)

const maxBodyBytes = 1 << 20

type errorEnvelope struct {
	Error struct {
		Code    domain.Code `json:"code"`
		Message string      `json:"message"`
	} `json:"error"`
}

// DecodeJSON reads a JSON body, rejecting unknown fields so a typo in a client payload surfaces as a 400 rather than being silently ignored.
func DecodeJSON(r *http.Request, dst any) *domain.AppError {
	if r.Body == nil {
		return domain.BadRequest("a JSON body is required")
	}
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		switch {
		case errors.As(err, &maxErr):
			return domain.BadRequest("request body is too large")
		case errors.Is(err, io.EOF):
			return domain.BadRequest("a JSON body is required")
		default:
			return domain.BadRequest("malformed JSON body")
		}
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return domain.BadRequest("body must contain a single JSON object")
	}
	return nil
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("encoding response failed", "error", err)
	}
}

// WriteError encodes an AppError.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	appErr := &domain.AppError{Code: domain.CodeInternal, Message: "something went wrong", HTTPStatus: http.StatusInternalServerError}

	var typed *domain.AppError
	if errors.As(err, &typed) {
		appErr = typed
	} else if err != nil {
		slog.ErrorContext(r.Context(), "unhandled error", "error", err, "path", r.URL.Path, "requestId", RequestIDFrom(r.Context()))
	}

	if appErr.HTTPStatus >= 500 {
		slog.ErrorContext(r.Context(), "request failed", "code", appErr.Code, "message", appErr.Message, "path", r.URL.Path, "requestId", RequestIDFrom(r.Context()))
	}

	var env errorEnvelope
	env.Error.Code = appErr.Code
	env.Error.Message = appErr.Message
	WriteJSON(w, appErr.HTTPStatus, env)
}
