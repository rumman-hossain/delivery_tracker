import { Flag, MapPin, Route } from 'lucide-react'
import { useState } from 'react'
import { ProofPhoto } from '@/components/photo/ProofPhoto'
import { RouteLine, RouteNode } from '@/components/map/RouteLine'
import { Sheet } from '@/components/ui/sheet'
import { applyCorrections, legDurations, type EffectiveEvent } from '@/lib/events'
import type { Trip, TripEvent } from '@/lib/schemas'
import { legFrom, EventRow } from '@/components/trip/EventRow'

/** What actually happened, in order. */

export function TripTimeline({
  trip,
  events,
  photos,
  onCorrect,
}: {
  trip: Trip
  events: TripEvent[]
  photos: Record<string, string>
  onCorrect?: (event: EffectiveEvent, stopName: string) => void
}) {
  const [photo, setPhoto] = useState<{ path: string; title: string } | null>(null)

  const effective = applyCorrections(events)
  const legs = legDurations(effective)
  const stopBySeq = new Map(trip.routeSnapshot.stops.map((s) => [s.seq, s]))

  if (effective.length === 0) {
    return (
      <p className="rounded-card bg-surface px-4 py-8 text-center text-subhead text-ink-2">
        This trip has not started. Nothing has been recorded yet.
      </p>
    )
  }

  return (
    <>
      <RouteLine>
        {effective.map((ev, i) => (
          <RouteNode
            key={ev.id}
            state="done"
            marker={
              ev.type === 'REACHED' ? (
                ev.seq
              ) : ev.type === 'START' ? (
                <MapPin size={13} />
              ) : ev.type === 'ROUTE_CHANGED' ? (
                <Route size={13} />
              ) : (
                <Flag size={13} />
              )
            }
            isFirst={i === 0}
            isLast={i === effective.length - 1}
          >
            <EventRow
              event={ev}
              stop={ev.seq ? stopBySeq.get(ev.seq) : undefined}
              start={trip.routeSnapshot.start.name}
              end={trip.routeSnapshot.end.name}
              legMs={legs[i]}
              legFrom={legFrom(effective, i, trip.routeSnapshot.start.name)}
              photoPath={photos[ev.id]}
              onOpenPhoto={setPhoto}
              onCorrect={onCorrect}
            />
          </RouteNode>
        ))}
      </RouteLine>

      <Sheet
        open={!!photo}
        onOpenChange={(v) => !v && setPhoto(null)}
        title={photo?.title ?? 'Photo'}
      >
        {photo ? (
          <ProofPhoto
            path={photo.path}
            alt={`Proof photo for ${photo.title}`}
            className="mb-4 min-h-40 w-full rounded-card bg-surface object-contain"
          />
        ) : null}
      </Sheet>
    </>
  )
}
