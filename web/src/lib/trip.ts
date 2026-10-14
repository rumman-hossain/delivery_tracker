import type { SnapshotStop, Trip } from '@/lib/schemas'

/** Naming a trip and its stops. */

export function stopName(stop: SnapshotStop): string {
  return stop.type === 'home' ? (stop.label ?? 'Home stop') : (stop.shopName ?? 'Shop')
}

/** A trip has no name of its own; the route it froze is what a driver recognises. */
export function routeTitle(trip: Trip): string {
  const first = trip.routeSnapshot.stops[0]
  return first ? `${stopName(first)} route` : 'Route'
}

/** Stops the driver has already filed, capped at the route length. */
export function recordedCount(trip: Trip): number {
  const total = trip.routeSnapshot.stops.length
  return Math.min(Math.max(trip.currentStopSeq - 1, 0), total)
}
