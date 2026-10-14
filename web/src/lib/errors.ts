/** Maps every backend error code to a sentence a driver or admin can act on. */

export const ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL',
  'TRIP_NOT_ACTIVE',
  'DRIVER_BUSY',
  'OUT_OF_ORDER',
  'ALREADY_RECORDED',
  'STOPS_REMAINING',
  'RATE_LIMITED',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Something in that request was not right. Check the form and try again.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'Your account does not have access to that.',
  NOT_FOUND: 'We could not find that.',
  INTERNAL: 'Something went wrong on our side. Try again in a moment.',
  TRIP_NOT_ACTIVE: 'Start this trip before recording a stop.',
  DRIVER_BUSY: 'Finish your trip in progress before starting another.',
  OUT_OF_ORDER: 'Record the previous stop first.',
  ALREADY_RECORDED: 'That stop has already been recorded.',
  STOPS_REMAINING: 'Every stop must be recorded before you can complete the trip.',
  RATE_LIMITED: 'Too many requests just now. Wait a moment and try again.',
}

export class ApiError extends Error {
  readonly code: ErrorCode | string
  readonly status: number

  constructor(code: ErrorCode | string, status: number, message?: string) {
    super(message ?? messageForCode(code))
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code)
}

/** Falls back to a neutral sentence rather than showing a raw code. */
export function messageForCode(code: string): string {
  return isErrorCode(code) ? MESSAGES[code] : MESSAGES.INTERNAL
}

/** The message for a failure that never reached the server. */
export const OFFLINE_MESSAGE = 'You need a connection to record this stop.'
