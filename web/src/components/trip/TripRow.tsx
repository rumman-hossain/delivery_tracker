import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import { TripPill } from '@/components/trip/StatusPill'
import { ListRow } from '@/components/ui/list'
import { formatLocalDate } from '@/lib/format'
import { recordedCount } from '@/lib/trip'
import type { Trip } from '@/lib/schemas'

/** One trip in an admin list: who ran it, when, and how far they got. */
export function TripRow({ trip }: { trip: Trip }) {
  const total = trip.routeSnapshot.stops.length

  return (
    <ListRow interactive className="p-0">
      <Link
        to={`/admin/trips/${trip.id}`}
        className="flex min-h-[66px] w-full items-center gap-3 px-4 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{trip.driverName}</p>
          <p className="tnum truncate text-footnote text-ink-3">
            {formatLocalDate(trip.assignedDate)} · {recordedCount(trip)} / {total} stops
          </p>
        </div>
        <TripPill status={trip.status} />
        <ChevronRight size={18} className="shrink-0 text-ink-3" />
      </Link>
    </ListRow>
  )
}
