import { describe, expect, it } from 'vitest'
import {
  zEvent,
  zNextStop,
  zReachedReq,
  zReachedResp,
  zShop,
  zTrip,
  zCreateUserReq,
  zAssignTripReq,
  zShopReq,
  zListTrips,
  zCorrectionReq,
  zRouteReq,
} from '@/lib/schemas'

describe('zShop', () => {
  it('accepts a shop with its own radius', () => {
    const parsed = zShop.parse({
      id: 's1', name: 'Shop A', lat: 35.6839, lng: 139.7744,
      address: '1-1 Chiyoda', radiusM: 50, active: true,
      createdAt: '2026-09-21T01:00:00Z',
    })
    expect(parsed.radiusM).toBe(50)
  })

  it('accepts a null radius, meaning "use the global"', () => {
    expect(zShop.parse({
      id: 's2', name: 'Shop B', lat: 35.6896, lng: 139.7006,
      radiusM: null, active: true, createdAt: '2026-09-21T01:00:00Z',
    }).radiusM).toBeNull()
  })

  it('rejects a shop with no coordinates', () => {
    expect(() => zShop.parse({ id: 's3', name: 'X', radiusM: null, active: true, createdAt: '' })).toThrow()
  })
})

describe('zTrip', () => {
  const trip = {
    id: 't1', routeId: 'r1', driverUid: 'u1', driverName: 'Sato',
    assignedDate: '2026-09-21', status: 'assigned', currentStopSeq: 1,
    createdAt: '2026-09-21T01:00:00Z',
    routeSnapshot: {
      start: { placeId: 'w1', name: 'WH', lat: 35.68, lng: 139.76 },
      end: { placeId: 'w1', name: 'WH', lat: 35.68, lng: 139.76 },
      stops: [
        { seq: 1, type: 'shop', shopId: 's1', shopName: 'Shop A', expectedLat: 35.6839, expectedLng: 139.7744, expectedRadiusM: 50 },
        { seq: 2, type: 'home', label: 'Tanaka residence' },
      ],
    },
  }

  it('accepts a freshly assigned trip', () => {
    const parsed = zTrip.parse(trip)
    expect(parsed.routeSnapshot.stops).toHaveLength(2)
    expect(parsed.routeSnapshot.stops[1].expectedLat).toBeUndefined()
    expect(parsed.routeSnapshot.stops[1].label).toBe('Tanaka residence')
  })

  it('accepts a completed trip with its timestamps', () => {
    const parsed = zTrip.parse({
      ...trip, status: 'completed', currentStopSeq: 3,
      startedAt: '2026-09-21T01:10:00Z', completedAt: '2026-09-21T02:00:00Z',
    })
    expect(parsed.completedAt).toBe('2026-09-21T02:00:00Z')
  })

  it('rejects a status the backend cannot produce', () => {
    expect(() => zTrip.parse({ ...trip, status: 'paused' })).toThrow()
  })
})

describe('zEvent', () => {
  it('accepts a matched shop capture', () => {
    const parsed = zEvent.parse({
      id: 'e1', type: 'REACHED', seq: 1, serverTime: '2026-09-21T01:41:08Z',
      clientTime: '2026-09-21T01:41:07Z', timeSkewMs: 1000,
      lat: 35.6839, lng: 139.7744, accuracyM: 12.4, sampleCount: 8,
      distanceM: 14.8, matchStatus: 'matched', deliveryStatus: 'delivered',
      photoPath: 'trips/t1/1.jpg', byRole: 'driver',
    })
    expect(parsed.matchStatus).toBe('matched')
    expect(parsed.distanceM).toBe(14.8)
  })

  it('accepts a home capture with a null distance', () => {
    const parsed = zEvent.parse({
      id: 'e2', type: 'REACHED', seq: 2, serverTime: '2026-09-21T01:55:00Z',
      distanceM: null, matchStatus: 'na', deliveryStatus: 'delivered',
      photoPath: 'trips/t1/2.jpg', byRole: 'driver',
    })
    expect(parsed.distanceM).toBeNull()
    expect(parsed.matchStatus).toBe('na')
  })

  it('accepts a START event with no photo and no stop', () => {
    const parsed = zEvent.parse({
      id: 'e0', type: 'START', serverTime: '2026-09-21T01:00:00Z',
      lat: 35.68, lng: 139.76, accuracyM: 9, byRole: 'driver',
    })
    expect(parsed.seq).toBeUndefined()
    expect(parsed.photoPath).toBeUndefined()
  })

  it('accepts a START event with no fix at all', () => {
    expect(() => zEvent.parse({ id: 'e0', type: 'START', serverTime: '2026-09-21T01:00:00Z', byRole: 'driver' })).not.toThrow()
  })

  it('accepts a CORRECTION referencing another event', () => {
    const parsed = zEvent.parse({
      id: 'e9', type: 'CORRECTION', serverTime: '2026-09-22T03:00:00Z',
      targetEventId: 'e1', changes: { deliveryStatus: 'partial' },
      reason: 'driver reported a partial delivery afterwards', byRole: 'admin',
    })
    expect(parsed.targetEventId).toBe('e1')
    expect(parsed.changes).toEqual({ deliveryStatus: 'partial' })
  })

  it('rejects a match verdict the backend cannot produce', () => {
    expect(() => zEvent.parse({ id: 'e', type: 'REACHED', serverTime: '', matchStatus: 'close enough' })).toThrow()
  })
})

describe('zReachedReq', () => {
  const base = {
    seq: 1, lat: 35.6839, lng: 139.7744, accuracyM: 12.4, sampleCount: 8,
    speed: 0, heading: null, clientTime: '2026-09-21T01:41:07.123Z',
    deliveryStatus: 'delivered' as const, photoPath: 'trips/t1/1.jpg',
  }

  it('accepts a complete shop capture', () => {
    expect(() => zReachedReq.parse(base)).not.toThrow()
  })

  it('accepts a home capture with no coordinates', () => {
    const { lat: _lat, lng: _lng, ...home } = base
    expect(() => zReachedReq.parse(home)).not.toThrow()
  })

  it('takes a capture with no photo, but not an empty one', () => {
    const { photoPath: _p, ...noPhoto } = base
    expect(() => zReachedReq.parse(noPhoto)).not.toThrow()
    expect(() => zReachedReq.parse({ ...base, photoPath: '' })).toThrow()
  })

  it('accepts a failed delivery, which is still recorded', () => {
    expect(() => zReachedReq.parse({ ...base, deliveryStatus: 'failed' })).not.toThrow()
  })

  it('rejects a seq of zero', () => {
    expect(() => zReachedReq.parse({ ...base, seq: 0 })).toThrow()
  })
})

describe('zReachedResp', () => {
  it('accepts the matched reply', () => {
    const parsed = zReachedResp.parse({
      eventId: 'e1', seq: 2, serverTime: '2026-09-21T01:41:08.001Z',
      distanceM: 14.8, matchStatus: 'matched', nextSeq: 3, tripStatus: 'in_progress',
    })
    expect(parsed.nextSeq).toBe(3)
  })

  it('accepts a home reply with a null distance', () => {
    expect(() => zReachedResp.parse({
      eventId: 'e2', seq: 2, serverTime: '2026-09-21T01:55:00Z',
      distanceM: null, matchStatus: 'na', nextSeq: 3, tripStatus: 'in_progress',
    })).not.toThrow()
  })
})

describe('zNextStop', () => {
  it('accepts a shop stop with its expected position', () => {
    const parsed = zNextStop.parse({
      seq: 1, type: 'shop', shopName: 'Shop A',
      expectedLat: 35.6839, expectedLng: 139.7744, expectedRadiusM: 50,
    })
    expect(parsed.expectedRadiusM).toBe(50)
  })

  it('accepts a home stop with only a label', () => {
    expect(zNextStop.parse({ seq: 2, type: 'home', label: 'Tanaka residence' }).expectedLat).toBeUndefined()
  })

  it('accepts the done marker at the end of a route', () => {
    expect(zNextStop.parse({ done: true }).done).toBe(true)
  })
})

describe('request validation mirrors the backend rules', () => {
  it('requires a real email and an 8-character temp password', () => {
    const user = { name: 'Sato', email: 'sato@example.com', phone: '090-1234-5678', tempPassword: 'temp1234', role: 'driver' }
    expect(() => zCreateUserReq.parse(user)).not.toThrow()
    expect(() => zCreateUserReq.parse({ ...user, email: 'sato' })).toThrow()
    expect(() => zCreateUserReq.parse({ ...user, tempPassword: 'short' })).toThrow()
  })

  it('takes a phone number however it is spelled, but not one nobody could ring', () => {
    const user = { name: 'Sato', email: 'sato@example.com', phone: '090-1234-5678', tempPassword: 'temp1234', role: 'driver' }
    for (const phone of ['090-1234-5678', '+81 90 1234 5678', '(090) 1234.5678', '09012345678']) {
      expect(() => zCreateUserReq.parse({ ...user, phone })).not.toThrow()
    }
    for (const phone of ['', '   ', '090-12', 'call me maybe', '090-1234-5678 ext. four']) {
      expect(() => zCreateUserReq.parse({ ...user, phone })).toThrow()
    }
  })

  it('requires assignedDate to be a calendar day', () => {
    expect(() => zAssignTripReq.parse({ routeId: 'r1', driverUid: 'u1', assignedDate: '2026-09-21' })).not.toThrow()
    expect(() => zAssignTripReq.parse({ routeId: 'r1', driverUid: 'u1', assignedDate: '21/09/2026' })).toThrow()
  })

  it('bounds a shop radius to 10..1000 whole metres, or null', () => {
    expect(() => zShopReq.parse({ radiusM: 10 })).not.toThrow()
    expect(() => zShopReq.parse({ radiusM: 1000 })).not.toThrow()
    expect(() => zShopReq.parse({ radiusM: null })).not.toThrow()
    expect(() => zShopReq.parse({ radiusM: 9 })).toThrow()
    expect(() => zShopReq.parse({ radiusM: 1001 })).toThrow()
    expect(() => zShopReq.parse({ radiusM: 50.5 })).toThrow()
  })
})

describe('list envelopes', () => {
  it('keeps the truncation flags the backend sends', () => {
    const parsed = zListTrips.parse({ trips: [], truncated: true, limit: 500 })
    expect(parsed.truncated).toBe(true)
    expect(parsed.limit).toBe(500)
  })

  it('still parses a response without them', () => {
    expect(zListTrips.parse({ trips: [] })).toEqual({ trips: [] })
  })
})

describe('zCorrectionReq', () => {
  it('accepts a correction to a judged value', () => {
    expect(
      zCorrectionReq.safeParse({
        targetEventId: 'ev-1',
        changes: { matchStatus: 'matched' },
        reason: 'the shop pin was wrong',
      }).success,
    ).toBe(true)
  })

  it('rejects a correction that changes nothing', () => {
    expect(
      zCorrectionReq.safeParse({ targetEventId: 'ev-1', changes: {}, reason: 'looked again' })
        .success,
    ).toBe(false)
  })

  it('rejects a correction with no reason', () => {
    expect(
      zCorrectionReq.safeParse({
        targetEventId: 'ev-1',
        changes: { deliveryStatus: 'failed' },
        reason: '',
      }).success,
    ).toBe(false)
  })

  it('drops an attempt to move the event in time', () => {
    const parsed = zCorrectionReq.parse({
      targetEventId: 'ev-1',
      changes: { deliveryStatus: 'failed', serverTime: '2020-01-01T00:00:00Z', seq: 99 },
      reason: 'nobody was home',
    })
    expect(parsed.changes).toEqual({ deliveryStatus: 'failed' })
  })

  it('allows clearing a distance, which is not the same as zero', () => {
    const parsed = zCorrectionReq.parse({
      targetEventId: 'ev-1',
      changes: { distanceM: null },
      reason: 'home stop, never measured',
    })
    expect(parsed.changes.distanceM).toBeNull()
  })
})

describe('zRouteReq', () => {
  const stops = [{ seq: 1, type: 'shop' as const, shopId: 's1' }]

  it('takes the two ends as place ids', () => {
    expect(() =>
      zRouteReq.parse({ name: 'Nakano morning', startPlaceId: 'w1', endPlaceId: 'w1', stops }),
    ).not.toThrow()
  })

  it('accepts a route that ends somewhere else', () => {
    expect(() =>
      zRouteReq.parse({ name: 'Nakano morning', startPlaceId: 'w1', endPlaceId: 'w2', stops }),
    ).not.toThrow()
  })

  it('rejects a blank place id', () => {
    expect(() => zRouteReq.parse({ name: 'R', startPlaceId: '', endPlaceId: 'w1', stops })).toThrow()
    expect(() => zRouteReq.parse({ name: 'R', startPlaceId: 'w1', endPlaceId: '', stops })).toThrow()
  })

  it('does not carry coordinates', () => {
    const parsed = zRouteReq.parse({
      name: 'R',
      startPlaceId: 'w1',
      endPlaceId: 'w1',
      stops,
      lat: 35.68,
    } as Record<string, unknown>)
    expect(parsed).not.toHaveProperty('lat')
  })

  it('patches one field at a time', () => {
    expect(() => zRouteReq.parse({ name: 'Renamed' })).not.toThrow()
    expect(() => zRouteReq.parse({ endPlaceId: 'w2' })).not.toThrow()
  })
})

describe('zShopReq positions', () => {
  it('takes a position', () => {
    expect(() => zShopReq.parse({ lat: 35.7, lng: 139.7 })).not.toThrow()
  })

  it('takes an explicit null, which is how one is removed', () => {
    expect(() => zShopReq.parse({ lat: null, lng: null })).not.toThrow()
  })

  it('takes neither, which leaves it alone', () => {
    expect(() => zShopReq.parse({ name: 'Renamed' })).not.toThrow()
  })

  it('still refuses an impossible one', () => {
    expect(() => zShopReq.parse({ lat: 91, lng: 139.7 })).toThrow()
    expect(() => zShopReq.parse({ lat: 35.7, lng: -181 })).toThrow()
  })
})
