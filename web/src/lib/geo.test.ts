import { describe, expect, it } from 'vitest'

import { haversineMeters, judge } from '@/lib/geo'

const SHOP = { expectedLat: 35.7342738, expectedLng: 139.7261857, expectedRadiusM: 50 }

describe('haversineMeters', () => {
  it('is zero at the same point', () => {
    expect(haversineMeters(35.7, 139.7, 35.7, 139.7)).toBe(0)
  })

  it('matches the server for a known separation', () => {
    expect(haversineMeters(35.7, 139.7, 35.701, 139.7)).toBeCloseTo(111.19, 1)
  })

  it('is symmetric', () => {
    const a = haversineMeters(35.7342738, 139.7261857, 35.7388016, 139.7483503)
    const b = haversineMeters(35.7388016, 139.7483503, 35.7342738, 139.7261857)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe('judge', () => {
  it('says at the shop inside the radius', () => {
    const v = judge(SHOP, { lat: 35.73429, lng: 139.72621 })
    expect(v.kind).toBe('at')
  })

  it('says away from it outside the radius', () => {
    const v = judge(SHOP, { lat: 35.7372738, lng: 139.7261857 })
    expect(v.kind).toBe('away')
    if (v.kind === 'away') expect(Math.round(v.distanceM)).toBeGreaterThan(300)
  })

  it('counts the boundary as being there', () => {
    const onEdge = { ...SHOP, expectedRadiusM: haversineMeters(35.7342738, 139.7261857, 35.7352738, 139.7261857) }
    expect(judge(onEdge, { lat: 35.7352738, lng: 139.7261857 }).kind).toBe('at')
  })

  it('judges nothing without a fix', () => {
    expect(judge(SHOP, null).kind).toBe('none')
  })

  it('judges nothing at a stop with no expected position', () => {
    expect(judge({}, { lat: 35.7, lng: 139.7 }).kind).toBe('none')
  })

  it('judges nothing when the stop carries no radius', () => {
    expect(judge({ expectedLat: 35.7, expectedLng: 139.7 }, { lat: 35.7, lng: 139.7 }).kind).toBe(
      'none',
    )
  })
})
