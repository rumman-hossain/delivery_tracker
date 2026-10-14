const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2)
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type Verdict =
  | { kind: 'at'; distanceM: number; radiusM: number }
  | { kind: 'away'; distanceM: number; radiusM: number }
  | { kind: 'none' }

/** Judges a fix against the stop the driver was sent to. */
export function judge(
  stop: { expectedLat?: number; expectedLng?: number; expectedRadiusM?: number },
  fix: { lat: number; lng: number } | null,
): Verdict {
  const { expectedLat, expectedLng, expectedRadiusM } = stop
  if (expectedLat === undefined || expectedLng === undefined || !fix) return { kind: 'none' }

  const distanceM = haversineMeters(expectedLat, expectedLng, fix.lat, fix.lng)
  if (expectedRadiusM === undefined) return { kind: 'none' }

  return {
    kind: distanceM <= expectedRadiusM ? 'at' : 'away',
    distanceM,
    radiusM: expectedRadiusM,
  }
}
