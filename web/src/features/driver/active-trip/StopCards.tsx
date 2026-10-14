import { Route } from 'lucide-react'
import { type NodeState } from '@/components/map/RouteLine'
import { Pill } from '@/components/trip/StatusPill'
import { formatLocalTime } from '@/lib/format'
import type { RouteNote, SnapshotStop, Trip } from '@/lib/schemas'

export function RouteChangedNote({ note }: { note: RouteNote }) {
  return (
    <section
      className="mb-6 flex items-start gap-2.5 rounded-card bg-surface px-4 py-3.5"
      aria-label="A change to your route"
    >
      <Route size={17} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-subhead font-semibold text-ink">Your route was changed</p>
        <p className="mt-1 text-subhead leading-snug text-ink-2">{note.reason}</p>
        <p className="tnum mt-1 text-footnote text-ink-3">{formatLocalTime(note.at)}</p>
      </div>
    </section>
  )
}

export function stopState(stop: SnapshotStop, trip: Trip): NodeState {
  if (trip.status === 'completed' || stop.seq < trip.currentStopSeq) return 'done'
  if (trip.status === 'assigned') return 'upcoming'
  return stop.seq === trip.currentStopSeq ? 'current' : 'upcoming'
}

export function stopMeta(stop: SnapshotStop, state: NodeState) {
  if (state === 'done') return 'Recorded'
  if (state === 'current') return 'Next stop'
  return stop.type === 'home' ? 'Home delivery' : 'Shop'
}

export function NodeHeader({
  title,
  meta,
  icon,
  emphasis,
}: {
  title: string
  meta?: string
  icon?: React.ReactNode
  emphasis?: boolean
}) {
  return (
    <div className="pt-3.5">
      <p
        className={
          emphasis
            ? 'text-[19px] font-bold leading-tight tracking-[-0.01em] text-ink'
            : 'text-body font-medium leading-tight text-ink'
        }
      >
        {title}
      </p>
      {meta ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-3">
          {icon}
          {meta}
        </p>
      ) : null}
    </div>
  )
}

export function CurrentStopCard({ stop }: { stop: SnapshotStop }) {
  const checked = stop.expectedLat !== undefined && stop.expectedRadiusM !== undefined
  const photoRequired = stop.type !== 'home'

  return (
    <div className="mt-3 rounded-card bg-surface px-4 py-3.5">
      <p className="text-callout leading-snug text-ink-2">
        {checked ? (
          <>
            Stand at the door before you tap. Your location is checked against{' '}
            <span className="tnum">{stop.expectedRadiusM} m</span> of it.
          </>
        ) : (
          <>
            Your location is recorded here, but there is nothing to check it against —
            this place has no position on file.
          </>
        )}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Pill tone="accent">Location required</Pill>
        {photoRequired ? <Pill tone="accent">Photo required</Pill> : <Pill>Photo optional</Pill>}
        {checked ? <Pill>Location checked</Pill> : <Pill>No location check</Pill>}
      </div>
    </div>
  )
}
