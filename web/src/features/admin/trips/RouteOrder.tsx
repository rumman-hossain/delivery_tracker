import { Fragment } from 'react'
import { applyCorrections } from '@/lib/events'
import type { Trip, TripEvent } from '@/lib/schemas'

export function RouteOrder({ trip, events }: { trip: Trip; events: TripEvent[] }) {
  const effective = applyCorrections(events)
  const { start, end, stops } = trip.routeSnapshot

  const chip = (key: string, label: string, tone: string) => (
    <li key={key} className="flex items-center gap-1.5">
      <span
        className={`grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white ${tone}`}
      >
        {label}
      </span>
    </li>
  )

  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 px-1 text-footnote text-ink-2">
      {chip('start', 'Start', 'bg-map-start')}
      <li aria-hidden className="text-ink-3">
        →
      </li>
      <li className="mr-2 min-w-0 truncate">{start.name}</li>

      {stops.map((stop) => {
        const ev = effective.find((e) => e.type === 'REACHED' && e.seq === stop.seq)
        const tone = !ev
          ? 'bg-map-pending'
          : ev.matchStatus === 'suspect'
            ? 'bg-map-suspect'
            : ev.matchStatus === 'matched'
              ? 'bg-map-captured'
              : 'bg-map-unchecked'

        return (
          <Fragment key={stop.seq}>
            <li aria-hidden className="text-ink-3">
              →
            </li>
            {chip(`n-${stop.seq}`, String(stop.seq), tone)}
            <li className="mr-2 min-w-0 truncate">{stop.shopName ?? stop.label}</li>
          </Fragment>
        )
      })}

      <li aria-hidden className="text-ink-3">
        →
      </li>
      {chip('end', 'End', 'bg-map-start')}
      <li className="min-w-0 truncate">{end.name}</li>
    </ol>
  )
}
