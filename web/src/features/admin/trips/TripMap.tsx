import { lazy, Suspense, useMemo } from 'react'
import { Skeleton } from '@/components/feedback/DataState'
import { SectionTitle } from '@/components/ui/list'
import type { Trip, TripEvent } from '@/lib/schemas'
import { buildMapData } from '@/features/admin/trips/mapData'
import { RouteOrder } from '@/features/admin/trips/RouteOrder'

export const MapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })))

export function TripMap({ trip, events }: { trip: Trip; events: TripEvent[] }) {
  const { markers, circles, links, route } = useMemo(() => buildMapData(trip, events), [trip, events])

  const enough = markers.length > 1

  return (
    <section className="mt-2">
      <SectionTitle>The route</SectionTitle>
      {enough ? (
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
          <MapView
            markers={markers}
            circles={circles}
            links={links}
            route={route}
            className="h-72"
          />
        </Suspense>
      ) : null}
      <RouteOrder trip={trip} events={events} />
      {enough ? <MapLegend trip={trip} /> : null}
    </section>
  )
}

export function MapLegend({ trip }: { trip: Trip }) {
  const { start, end } = trip.routeSnapshot
  const ends = end.placeId === start.placeId ? start.name : `${start.name} to ${end.name}`

  const keys: { tone: string; label: string }[] = [
    { tone: 'bg-map-captured', label: 'At the shop' },
    { tone: 'bg-map-suspect', label: 'Away from it' },
    { tone: 'bg-map-unchecked', label: 'Recorded, not checked' },
    { tone: 'bg-map-pending', label: 'Not yet reached' },
    { tone: 'bg-map-start', label: 'Start and end' },
  ]

  return (
    <div className="mt-2 px-1">
      <p className="text-footnote leading-snug text-ink-3">
        The line runs {ends}, calling at each stop in order. Numbered marks are the stops,
        lettered ones the two ends; the small dot beside a stop is where the driver actually
        stood, and a dot outside its dashed circle is what makes a stop flagged. A stop with
        no address on file has no circle to miss — it is drawn where the driver stood and
        nothing is checked against it.
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {keys.map((k) => (
          <li key={k.label} className="flex items-center gap-1.5 text-footnote text-ink-3">
            <span className={`size-2.5 shrink-0 rounded-full ${k.tone}`} aria-hidden />
            {k.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
