import type { TripEvent } from '@/lib/schemas'

/** Events are append-only. */

export type EffectiveEvent = TripEvent & {
  corrections: TripEvent[]
}

const CORRECTABLE = new Set([
  'lat',
  'lng',
  'accuracyM',
  'distanceM',
  'matchStatus',
  'deliveryStatus',
  'photoPath',
])

/** Folds CORRECTION events over their targets and returns the timeline, oldest first. */
export function applyCorrections(events: TripEvent[]): EffectiveEvent[] {
  const ordered = events.slice().sort(byServerTime)

  const out = new Map<string, EffectiveEvent>()
  for (const ev of ordered) {
    if (ev.type !== 'CORRECTION') out.set(ev.id, { ...ev, corrections: [] })
  }

  for (const ev of ordered) {
    if (ev.type !== 'CORRECTION' || !ev.targetEventId) continue
    const target = out.get(ev.targetEventId)
    if (!target) continue

    for (const [key, value] of Object.entries(ev.changes ?? {})) {
      if (CORRECTABLE.has(key)) (target as Record<string, unknown>)[key] = value
    }
    target.corrections.push(ev)
  }

  return [...out.values()].sort(byServerTime)
}

const byServerTime = (a: TripEvent, b: TripEvent) => a.serverTime.localeCompare(b.serverTime)

const MARKS_A_PLACE = new Set(['START', 'REACHED', 'COMPLETE'])

export function legDurations(events: { serverTime: string; type?: string }[]): (number | null)[] {
  const out: (number | null)[] = []
  let previous: number | null = null

  for (const ev of events) {
    if (ev.type !== undefined && !MARKS_A_PLACE.has(ev.type)) {
      out.push(null)
      continue
    }
    const at = new Date(ev.serverTime).getTime()
    out.push(previous === null ? null : at - previous)
    previous = at
  }
  return out
}

export const countSuspect = (events: TripEvent[]) =>
  events.filter((e) => e.type === 'REACHED' && e.matchStatus === 'suspect').length
