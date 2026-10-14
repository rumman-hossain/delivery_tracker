import { describe, expect, it } from 'vitest'
import { ApiError, ERROR_CODES, isErrorCode, messageForCode, OFFLINE_MESSAGE } from '@/lib/errors'

describe('error messages', () => {
  it('covers every code the backend can return', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        'ALREADY_RECORDED',
        'BAD_REQUEST',
        'DRIVER_BUSY',
        'FORBIDDEN',
        'INTERNAL',
        'NOT_FOUND',
        'OUT_OF_ORDER',
        'RATE_LIMITED',
        'STOPS_REMAINING',
        'TRIP_NOT_ACTIVE',
        'UNAUTHENTICATED',
      ].sort(),
    )
  })

  it('gives every code a message a person can act on', () => {
    for (const code of ERROR_CODES) {
      const msg = messageForCode(code)
      expect(msg.length).toBeGreaterThan(10)
      expect(msg).not.toContain('_')
      expect(msg).not.toBe(code)
    }
  })

  it('tells a driver what to do about the lifecycle conflicts', () => {
    expect(messageForCode('OUT_OF_ORDER')).toMatch(/previous stop/i)
    expect(messageForCode('DRIVER_BUSY')).toMatch(/in progress/i)
    expect(messageForCode('STOPS_REMAINING')).toMatch(/every stop/i)
    expect(messageForCode('TRIP_NOT_ACTIVE')).toMatch(/start/i)
    expect(messageForCode('ALREADY_RECORDED')).toMatch(/already/i)
  })

  it('falls back to a neutral sentence for an unknown code', () => {
    expect(messageForCode('WAT')).toBe(messageForCode('INTERNAL'))
    expect(isErrorCode('WAT')).toBe(false)
    expect(isErrorCode('DRIVER_BUSY')).toBe(true)
  })

  it('builds an ApiError carrying the code and status', () => {
    const err = new ApiError('OUT_OF_ORDER', 409)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('OUT_OF_ORDER')
    expect(err.status).toBe(409)
    expect(err.message).toBe(messageForCode('OUT_OF_ORDER'))
  })

  it('prefers a message the server supplied over the generic one', () => {
    const err = new ApiError('BAD_REQUEST', 400, 'radiusM must be between 10 and 1000')
    expect(err.message).toBe('radiusM must be between 10 and 1000')
  })

  it('explains that recording a stop needs a connection', () => {
    expect(OFFLINE_MESSAGE).toMatch(/connection/i)
  })
})
