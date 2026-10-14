import { TripPill } from '@/components/trip/StatusPill'
import { ListSection, ListValueRow } from '@/components/ui/list'
import { countSuspect } from '@/lib/events'
import { formatDurationMs, formatLocalDate } from '@/lib/format'
import type { Trip, TripEvent } from '@/lib/schemas'

export function Summary({ trip, events }: { trip: Trip; events: TripEvent[] }) {
  const total = trip.routeSnapshot.stops.length
  const recorded = events.filter((e) => e.type === 'REACHED').length
  const suspect = countSuspect(events)

  const elapsed =
    trip.startedAt && trip.completedAt
      ? new Date(trip.completedAt).getTime() - new Date(trip.startedAt).getTime()
      : null

  return (
    <ListSection>
      <ListValueRow label="Driver" value={trip.driverName} />
      <ListValueRow label="Date" value={formatLocalDate(trip.assignedDate)} />
      <ListValueRow label="Status" value={<TripPill status={trip.status} />} />
      <ListValueRow label="Stops recorded" value={`${recorded} of ${total}`} />
      {suspect > 0 ? (
        <ListValueRow
          label="Flagged for review"
          value={<span className="text-suspect">{suspect}</span>}
          hint="Recorded away from the expected shop"
        />
      ) : null}
      {elapsed !== null ? (
        <ListValueRow label="Time on route" value={formatDurationMs(elapsed)} />
      ) : null}
    </ListSection>
  )
}
