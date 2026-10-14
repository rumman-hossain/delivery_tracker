import type { Circle, Marker, MarkerStatus, RoutePath } from '@/components/map/MapView'
import { applyCorrections } from '@/lib/events'
import type { Trip, TripEvent } from '@/lib/schemas'

/** The map's marks, derived from the trip and what came back from the road. */
export function buildMapData(trip: Trip, events: TripEvent[]) {
  const effective = applyCorrections(events)
  const { start, end } = trip.routeSnapshot
  const sameEnds = end.placeId === start.placeId

  const started = !!trip.startedAt
  const finished = !!trip.completedAt

  const markers: Marker[] = [
    {
      lat: start.lat,
      lng: start.lng,
      kind: 'base',
      label: start.name,
      badge: sameEnds ? 'S·E' : 'S',
      status: (sameEnds ? finished : started) ? 'done' : 'pending',
    },
  ]
  if (!sameEnds) {
    markers.push({
      lat: end.lat,
      lng: end.lng,
      kind: 'base',
      label: end.name,
      badge: 'E',
      status: finished ? 'done' : 'pending',
    })
  }

  const circles: Circle[] = []
  const links: { from: Marker; to: Marker; suspect?: boolean }[] = []
  const route: RoutePath = [{ lat: start.lat, lng: start.lng }]

  for (const stop of trip.routeSnapshot.stops) {
    const ev = effective.find((e) => e.type === 'REACHED' && e.seq === stop.seq)

    if (stop.expectedLat === undefined || stop.expectedLng === undefined) {
      if (ev?.lat !== undefined && ev.lng !== undefined) {
        markers.push({
          lat: ev.lat,
          lng: ev.lng,
          kind: 'captured',
          label: stop.shopName ?? stop.label,
          badge: String(stop.seq),
          status:
            ev.matchStatus === 'suspect'
              ? 'suspect'
              : ev.matchStatus === 'matched'
                ? 'matched'
                : 'unchecked',
        })
        route.push({ lat: ev.lat, lng: ev.lng })
      }
      continue
    }
    route.push({ lat: stop.expectedLat, lng: stop.expectedLng })

    const status: MarkerStatus = !ev
      ? 'pending'
      : ev.matchStatus === 'suspect'
        ? 'suspect'
        : 'matched'

    const expected: Marker = {
      lat: stop.expectedLat,
      lng: stop.expectedLng,
      kind: 'expected',
      label: stop.shopName ?? stop.label,
      badge: String(stop.seq),
      status,
    }
    markers.push(expected)
    if (stop.expectedRadiusM) {
      circles.push({ lat: stop.expectedLat, lng: stop.expectedLng, radiusM: stop.expectedRadiusM })
    }

    if (ev?.lat !== undefined && ev.lng !== undefined) {
      const captured: Marker = {
        lat: ev.lat,
        lng: ev.lng,
        kind: 'captured',
        label: stop.shopName ?? stop.label,
        status,
      }
      markers.push(captured)
      links.push({ from: expected, to: captured, suspect: ev.matchStatus === 'suspect' })
    }
  }

  route.push({ lat: end.lat, lng: end.lng })

  return { markers, circles, links, route }
}
