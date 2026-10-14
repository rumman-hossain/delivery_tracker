import { AlertTriangle, MessageSquareQuote, SquarePen } from 'lucide-react'
import { ProofPhoto } from '@/components/photo/ProofPhoto'
import { DeliveryPill, MatchPill, Pill } from '@/components/trip/StatusPill'
import { type EffectiveEvent } from '@/lib/events'
import {
  formatAccuracy,
  formatDistance,
  formatDurationMs,
  formatLocalTime,
  isSkewNotable,
} from '@/lib/format'
import type { SnapshotStop } from '@/lib/schemas'

export function legFrom(events: EffectiveEvent[], index: number, base: string): string {
  for (let i = index - 1; i >= 0; i--) {
    const previous = events[i]
    if (previous.type === 'START') return base
    if (previous.type === 'REACHED' || previous.type === 'COMPLETE') return 'the last stop'
  }
  return 'the start'
}

export function remainingAfter(event: EffectiveEvent): number {
  const n = (event.changes as { pendingStops?: unknown } | undefined)?.pendingStops
  return typeof n === 'number' ? n : 0
}

export function EventRow({
  event,
  stop,
  start,
  end,
  legMs,
  legFrom,
  photoPath,
  onOpenPhoto,
  onCorrect,
}: {
  event: EffectiveEvent
  stop?: SnapshotStop
  start: string
  end: string
  legMs: number | null
  legFrom: string
  photoPath?: string
  onOpenPhoto: (p: { path: string; title: string }) => void
  onCorrect?: (event: EffectiveEvent, stopName: string) => void
}) {
  const title =
    event.type === 'START'
      ? `Left ${start}`
      : event.type === 'COMPLETE'
        ? `Back at ${end}`
        : event.type === 'ROUTE_CHANGED'
          ? 'Route changed'
          : stop?.type === 'home'
            ? (stop.label ?? 'Home stop')
            : (stop?.shopName ?? `Stop ${event.seq}`)

  return (
    <div className="pt-3 pb-1">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{title}</p>
        <span className="tnum shrink-0 text-subhead text-ink-2">{formatLocalTime(event.serverTime)}</span>
      </div>

      {legMs !== null ? (
        <p className="tnum mt-0.5 text-footnote text-ink-3">
          {formatDurationMs(legMs)} from {legFrom}
        </p>
      ) : null}

      {event.type === 'ROUTE_CHANGED' ? (
        <div className="mt-1.5 rounded-card bg-surface px-4 py-3">
          {event.reason ? (
            <p className="text-callout leading-snug text-ink">{event.reason}</p>
          ) : null}
          <p className="tnum mt-1 text-footnote text-ink-3">
            {remainingAfter(event)} stop{remainingAfter(event) === 1 ? '' : 's'} left at the time
            {event.byRole ? ` · changed by an ${event.byRole}` : ''}
          </p>
        </div>
      ) : null}

      {event.type === 'REACHED' ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {event.matchStatus ? <MatchPill status={event.matchStatus} /> : null}
            {event.deliveryStatus ? <DeliveryPill status={event.deliveryStatus} /> : null}
            {event.corrections.length > 0 ? <Pill tone="accent">Corrected</Pill> : null}
          </div>

          <dl className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-footnote text-ink-3">
            {event.distanceM !== null && event.distanceM !== undefined ? (
              <div className="flex gap-1">
                <dt>Distance</dt>
                <dd className="text-ink-2">{formatDistance(event.distanceM)}</dd>
              </div>
            ) : null}
            <div className="flex gap-1">
              <dt>Accuracy</dt>
              <dd className="text-ink-2">{formatAccuracy(event.accuracyM)}</dd>
            </div>
            {event.sampleCount ? (
              <div className="flex gap-1">
                <dt>Readings</dt>
                <dd className="text-ink-2">{event.sampleCount}</dd>
              </div>
            ) : null}
            {event.lat !== undefined && event.lng !== undefined ? (
              <div className="flex gap-1">
                <dt className="sr-only">Coordinates</dt>
                <dd className="select-all text-ink-2">
                  {event.lat.toFixed(6)}, {event.lng.toFixed(6)}
                </dd>
              </div>
            ) : null}
          </dl>

          {event.note ? (
            <p className="mt-2 flex items-start gap-1.5 text-callout leading-snug text-ink-2">
              <MessageSquareQuote size={14} className="mt-0.5 shrink-0 text-ink-3" />
              <span>{event.note}</span>
            </p>
          ) : null}

          {isSkewNotable(event.timeSkewMs) ? (
            <p className="mt-2 flex items-start gap-1.5 text-footnote leading-snug text-suspect">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                The driver's phone clock was {formatDurationMs(Math.abs(event.timeSkewMs ?? 0))} out.
                Times above are the server's.
              </span>
            </p>
          ) : null}

          <div className="mt-2.5 flex items-end gap-3">
            {photoPath ? (
              <button
                type="button"
                onClick={() => onOpenPhoto({ path: photoPath, title })}
                className="block shrink-0 overflow-hidden rounded-xl"
              >
                <ProofPhoto
                  path={photoPath}
                  alt={`Proof photo for ${title}`}
                  className="h-24 w-32 object-cover"
                />
              </button>
            ) : (
              <p className="text-footnote text-suspect">No photo was stored for this stop.</p>
            )}

            {onCorrect ? (
              <button
                type="button"
                onClick={() => onCorrect(event, title)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-callout font-semibold text-accent"
              >
                <SquarePen size={15} />
                Correct
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
