import { describe, expect, it } from 'vitest'

import { buildMapData } from '@/features/admin/trips/mapData'
import type { Trip, TripEvent } from '@/lib/schemas'

const depot = { placeId: 'w1', name: 'Main Base', lat: 35.8036, lng: 139.7537 }

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  routeId: 'r1',
  driverUid: 'd1',
  driverName: 'Sato',
  assignedDate: '2026-09-22',
  status: 'in_progress',
  currentStopSeq: 2,
  createdAt: '2026-09-22T00:00:00Z',
  routeVersion: 0,
  routeSnapshot: {
    start: depot,
    end: depot,
    stops: [
      { seq: 1, type: 'shop', shopId: 's1', shopName: 'Sugamo', expectedLat: 35.7317, expectedLng: 139.7402, expectedRadiusM: 50 },
      { seq: 2, type: 'home', label: 'Sato-san 3F' },
      { seq: 3, type: 'shop', shopId: 's2', shopName: 'Komagome', expectedLat: 35.7388, expectedLng: 139.7483, expectedRadiusM: 50 },
    ],
  },
  ...over,
})

const reached = (
  seq: number,
  matchStatus: 'matched' | 'suspect' | 'na',
  lat: number,
  lng: number,
): TripEvent => ({
  id: `e${seq}`,
  type: 'REACHED',
  seq,
  serverTime: '2026-09-22T01:00:00Z',
  lat,
  lng,
  distanceM: matchStatus === 'na' ? null : matchStatus === 'matched' ? 12 : 340,
  matchStatus,
  deliveryStatus: 'delivered',
  photoPath: `trips/t1/${seq}.jpg`,
  byRole: 'driver',
})

const badges = (d: ReturnType<typeof buildMapData>) =>
  d.markers.filter((m) => m.badge).map((m) => `${m.badge}:${m.status}`)

describe('buildMapData', () => {
  it('numbers a stop by its own seq, not its place among the marks', () => {
    const d = buildMapData(trip(), [reached(1, 'matched', 35.7317, 139.7402)])
    expect(badges(d)).toEqual(['S·E:pending', '1:matched', '3:pending'])
  })

  it('colours a stop the driver has not reached as pending, not as a problem', () => {
    const d = buildMapData(trip(), [])
    expect(badges(d)).toEqual(['S·E:pending', '1:pending', '3:pending'])
  })

  it('carries a flagged capture through as suspect', () => {
    const d = buildMapData(trip(), [reached(1, 'suspect', 35.7350, 139.7402)])
    expect(badges(d)).toContain('1:suspect')
    const captured = d.markers.filter((m) => m.kind === 'captured')
    expect(captured).toHaveLength(1)
    expect(captured[0].status).toBe('suspect')
    expect(captured[0].badge).toBeUndefined()
  })

  it('draws a single end mark when the round returns to where it started', () => {
    const d = buildMapData(trip(), [])
    expect(d.markers.filter((m) => m.kind === 'base')).toHaveLength(1)
  })

  it('draws both ends when they are different places', () => {
    const t = trip()
    t.routeSnapshot.end = { placeId: 'w2', name: 'Frozen warehouse', lat: 35.8032, lng: 139.7475 }
    const d = buildMapData(t, [])
    expect(badges(d).slice(0, 2)).toEqual(['S:pending', 'E:pending'])
  })

  it('marks the ends done once the trip has started and finished', () => {
    const started = buildMapData(trip({ startedAt: '2026-09-22T00:30:00Z' }), [])
    expect(badges(started)[0]).toBe('S·E:pending')

    const done = buildMapData(
      trip({ status: 'completed', startedAt: '2026-09-22T00:30:00Z', completedAt: '2026-09-22T03:00:00Z' }),
      [],
    )
    expect(badges(done)[0]).toBe('S·E:done')
  })

  it('runs the line from the start, through the stops, to the end', () => {
    const d = buildMapData(trip(), [])
    expect(d.route[0]).toEqual({ lat: depot.lat, lng: depot.lng })
    expect(d.route.at(-1)).toEqual({ lat: depot.lat, lng: depot.lng })
    expect(d.route).toHaveLength(4)
  })
  describe('a stop with no surveyed position', () => {
    it('draws the capture as recorded-but-unchecked, never as matched', () => {
      const d = buildMapData(trip(), [reached(2, 'na', 35.7401, 139.7509)])
      expect(badges(d)).toEqual(['S·E:pending', '1:pending', '2:unchecked', '3:pending'])
    })

    it('badges it, because it is the only mark that stop has', () => {
      const d = buildMapData(trip(), [reached(2, 'na', 35.7401, 139.7509)])
      const mark = d.markers.find((m) => m.badge === '2')
      expect(mark).toMatchObject({ kind: 'captured', lat: 35.7401, lng: 139.7509 })
      expect(d.circles).toHaveLength(2)
      expect(d.circles.some((c) => c.lat === 35.7401)).toBe(false)
      expect(d.links).toHaveLength(0)
    })

    it('puts it on the line in its own place in the order', () => {
      const d = buildMapData(trip(), [reached(2, 'na', 35.7401, 139.7509)])
      expect(d.route).toEqual([
        { lat: depot.lat, lng: depot.lng },
        { lat: 35.7317, lng: 139.7402 },
        { lat: 35.7401, lng: 139.7509 },
        { lat: 35.7388, lng: 139.7483 },
        { lat: depot.lat, lng: depot.lng },
      ])
    })

    it('follows a correction an admin appended rather than the original', () => {
      const d = buildMapData(trip(), [reached(2, 'suspect', 35.7401, 139.7509)])
      expect(badges(d)).toContain('2:suspect')
    })

    it('leaves the stop off entirely until it is recorded', () => {
      const d = buildMapData(trip(), [])
      expect(badges(d)).not.toContain('2:unchecked')
      expect(d.markers.some((m) => m.badge === '2')).toBe(false)
    })
  })
})
