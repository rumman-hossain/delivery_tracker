import { describe, expect, it } from 'vitest'

import { applyCorrections, countSuspect, legDurations } from '@/lib/events'
import type { TripEvent } from '@/lib/schemas'

const reached = (over: Partial<TripEvent> & { id: string; serverTime: string }): TripEvent => ({
  type: 'REACHED',
  seq: 1,
  matchStatus: 'suspect',
  deliveryStatus: 'delivered',
  distanceM: 400,
  ...over,
})

describe('applyCorrections', () => {
  it('folds a correction over its target and drops the correction from the timeline', () => {
    const [event] = applyCorrections([
      reached({ id: 'a', serverTime: '2026-09-22T01:00:00Z' }),
      {
        id: 'c1',
        type: 'CORRECTION',
        serverTime: '2026-09-22T05:00:00Z',
        targetEventId: 'a',
        changes: { distanceM: 18, matchStatus: 'matched' },
        reason: 'shop pin was wrong',
      },
    ])

    expect(event.id).toBe('a')
    expect(event.distanceM).toBe(18)
    expect(event.matchStatus).toBe('matched')
    expect(event.corrections).toHaveLength(1)
  })

  it('lets a later correction win over an earlier one', () => {
    const [event] = applyCorrections([
      reached({ id: 'a', serverTime: '2026-09-22T01:00:00Z' }),
      {
        id: 'c1',
        type: 'CORRECTION',
        serverTime: '2026-09-22T02:00:00Z',
        targetEventId: 'a',
        changes: { deliveryStatus: 'partial' },
      },
      {
        id: 'c2',
        type: 'CORRECTION',
        serverTime: '2026-09-22T03:00:00Z',
        targetEventId: 'a',
        changes: { deliveryStatus: 'failed' },
      },
    ])

    expect(event.deliveryStatus).toBe('failed')
    expect(event.corrections.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('ignores a change to a field that is not correctable', () => {
    const [event] = applyCorrections([
      reached({ id: 'a', serverTime: '2026-09-22T01:00:00Z' }),
      {
        id: 'c1',
        type: 'CORRECTION',
        serverTime: '2026-09-22T02:00:00Z',
        targetEventId: 'a',
        changes: { serverTime: '2020-01-01T00:00:00Z', seq: 99 },
      },
    ])

    expect(event.serverTime).toBe('2026-09-22T01:00:00Z')
    expect(event.seq).toBe(1)
  })

  it('orders the timeline by serverTime regardless of the order it arrived in', () => {
    const ids = applyCorrections([
      reached({ id: 'late', serverTime: '2026-09-22T03:00:00Z' }),
      { id: 'start', type: 'START', serverTime: '2026-09-22T01:00:00Z' },
      reached({ id: 'mid', serverTime: '2026-09-22T02:00:00Z' }),
    ]).map((e) => e.id)

    expect(ids).toEqual(['start', 'mid', 'late'])
  })
})

describe('legDurations', () => {
  it('has no leg for the first event and measures each later one from its predecessor', () => {
    expect(
      legDurations([
        { serverTime: '2026-09-22T01:00:00Z' },
        { serverTime: '2026-09-22T01:19:00Z' },
        { serverTime: '2026-09-22T01:20:30Z' },
      ]),
    ).toEqual([null, 19 * 60_000, 90_000])
  })
})

describe('countSuspect', () => {
  it('counts only REACHED events flagged suspect', () => {
    expect(
      countSuspect([
        reached({ id: 'a', serverTime: '2026-09-22T01:00:00Z', matchStatus: 'suspect' }),
        reached({ id: 'b', serverTime: '2026-09-22T02:00:00Z', matchStatus: 'matched' }),
        reached({ id: 'c', serverTime: '2026-09-22T03:00:00Z', matchStatus: 'na' }),
      ]),
    ).toBe(1)
  })
})

describe('legDurations with a route change in the middle', () => {
  const timeline = [
    { type: 'START', serverTime: '2026-09-22T01:00:00Z' },
    { type: 'REACHED', serverTime: '2026-09-22T01:40:00Z' },
    { type: 'ROUTE_CHANGED', serverTime: '2026-09-22T01:58:00Z' },
    { type: 'REACHED', serverTime: '2026-09-22T02:10:00Z' },
  ]

  it('carries the leg across the change rather than splitting it', () => {
    const legs = legDurations(timeline)
    expect(legs[0]).toBeNull()
    expect(legs[1]).toBe(40 * 60_000)
    expect(legs[2]).toBeNull()
    expect(legs[3]).toBe(30 * 60_000)
  })

  it('still measures a plain list with no types', () => {
    expect(
      legDurations([
        { serverTime: '2026-09-22T01:00:00Z' },
        { serverTime: '2026-09-22T01:19:00Z' },
      ]),
    ).toEqual([null, 19 * 60_000])
  })
})
