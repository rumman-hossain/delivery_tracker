import { describe, expect, it } from 'vitest'
import {
  formatAccuracy,
  formatDistance,
  formatDuration,
  formatDurationMs,
  formatLocalDate,
  formatLocalTime,
  formatRadius,
  isSkewNotable,
  todayJst,
  formatTripDate,
} from '@/lib/format'

describe('TIMEZONE rendering', () => {
  it('renders a UTC instant in the configured timezone', () => {
    expect(formatLocalTime('2026-09-21T01:41:08.000Z')).toBe('10:41:08')
    expect(formatLocalDate('2026-09-21T01:41:08.000Z')).toBe('2026-09-21')
  })

  it('rolls the date forward for a late-evening UTC instant', () => {
    expect(formatLocalDate('2026-09-20T22:30:00.000Z')).toBe('2026-09-21')
    expect(formatLocalTime('2026-09-20T22:30:00.000Z')).toBe('07:30:00')
  })

  it('gives todayJst as the YYYY-MM-DD the API expects', () => {
    expect(todayJst(new Date('2026-09-20T22:30:00.000Z'))).toBe('2026-09-21')
    expect(todayJst(new Date('2026-09-21T01:00:00.000Z'))).toBe('2026-09-21')
  })
})

describe('leg durations', () => {
  it('formats a gap of minutes and seconds', () => {
    expect(formatDuration('2026-09-21T10:00:00.000Z', '2026-09-21T10:07:12.000Z')).toBe('7m 12s')
  })

  it('drops to hours and minutes once past an hour', () => {
    expect(formatDuration('2026-09-21T10:00:00.000Z', '2026-09-21T11:30:00.000Z')).toBe('1h 30m')
  })

  it('formats a gap under a minute in seconds', () => {
    expect(formatDurationMs(45_000)).toBe('45s')
  })

  it('marks a negative gap rather than hiding it', () => {
    expect(formatDurationMs(-5_000)).toBe('-5s')
  })

  it('degrades to a dash rather than NaN', () => {
    expect(formatDurationMs(Number.NaN)).toBe('—')
  })
})

describe('distances and radii', () => {
  it('shows metres below a kilometre and kilometres above', () => {
    expect(formatDistance(14.8)).toBe('15 m')
    expect(formatDistance(208)).toBe('208 m')
    expect(formatDistance(1500)).toBe('1.50 km')
  })

  it('shows a dash for a home stop', () => {
    expect(formatDistance(null)).toBe('—')
    expect(formatDistance(undefined)).toBe('—')
  })

  it('distinguishes a zero distance from a missing one', () => {
    expect(formatDistance(0)).toBe('0 m')
  })

  it('says "default" when a shop has no radius of its own', () => {
    expect(formatRadius(null)).toBe('default')
    expect(formatRadius(undefined)).toBe('default')
    expect(formatRadius(50)).toBe('50 m')
  })

  it('renders accuracy as a tolerance', () => {
    expect(formatAccuracy(12.4)).toBe('±12 m')
    expect(formatAccuracy(null)).toBe('—')
  })
})

describe('clock skew', () => {
  it('ignores ordinary drift', () => {
    expect(isSkewNotable(1_500)).toBe(false)
    expect(isSkewNotable(-30_000)).toBe(false)
  })

  it('flags large drift in either direction', () => {
    expect(isSkewNotable(120_000)).toBe(true)
    expect(isSkewNotable(-600_000)).toBe(true)
  })

  it('says nothing when there is no skew recorded', () => {
    expect(isSkewNotable(null)).toBe(false)
    expect(isSkewNotable(undefined)).toBe(false)
  })
})

describe('formatTripDate', () => {
  const now = new Date('2026-09-22T03:00:00Z')

  it('names the days a driver actually cares about', () => {
    expect(formatTripDate('2026-09-22', now)).toBe('Today')
    expect(formatTripDate('2026-09-23', now)).toBe('Tomorrow')
    expect(formatTripDate('2026-09-21', now)).toBe('Yesterday')
  })

  it('drops the year within the current year and keeps it outside', () => {
    expect(formatTripDate('2026-09-28', now)).toBe('Mon 28 Sep')
    expect(formatTripDate('2025-12-31', now)).toBe('31 Dec 2025')
  })

  it('reads the boundary in TIMEZONE, not in the browser timezone', () => {
    expect(formatTripDate('2026-09-23', new Date('2026-09-22T16:00:00Z'))).toBe('Today')
  })
})
