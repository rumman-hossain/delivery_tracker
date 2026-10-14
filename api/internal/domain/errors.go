package domain

import "net/http"

// Code is the stable error identifier the frontend maps to an English sentence.
type Code string

const (
	CodeBadRequest      Code = "BAD_REQUEST"
	CodeUnauthenticated Code = "UNAUTHENTICATED"
	CodeForbidden       Code = "FORBIDDEN"
	CodeNotFound        Code = "NOT_FOUND"
	CodeInternal        Code = "INTERNAL"

	CodeTripNotActive   Code = "TRIP_NOT_ACTIVE"
	CodeDriverBusy      Code = "DRIVER_BUSY"
	CodeOutOfOrder      Code = "OUT_OF_ORDER"
	CodeAlreadyRecorded Code = "ALREADY_RECORDED"
	CodeStopsRemaining  Code = "STOPS_REMAINING"

	CodeRateLimited Code = "RATE_LIMITED"
)

// AppError is the only error type handlers encode.
type AppError struct {
	Code       Code
	Message    string
	HTTPStatus int
}

func (e *AppError) Error() string { return string(e.Code) + ": " + e.Message }

func BadRequest(msg string) *AppError {
	return &AppError{CodeBadRequest, msg, http.StatusBadRequest}
}

func Unauthenticated(msg string) *AppError {
	return &AppError{CodeUnauthenticated, msg, http.StatusUnauthorized}
}

func Forbidden(msg string) *AppError {
	return &AppError{CodeForbidden, msg, http.StatusForbidden}
}

func NotFound(msg string) *AppError {
	return &AppError{CodeNotFound, msg, http.StatusNotFound}
}

func Internal(msg string) *AppError {
	return &AppError{CodeInternal, msg, http.StatusInternalServerError}
}

func RateLimited(msg string) *AppError {
	return &AppError{CodeRateLimited, msg, http.StatusTooManyRequests}
}

// Conflict builds one of the five lifecycle 409s.
func Conflict(code Code, msg string) *AppError {
	return &AppError{code, msg, http.StatusConflict}
}
