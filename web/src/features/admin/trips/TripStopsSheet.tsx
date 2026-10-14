import { Plus } from 'lucide-react'
import { useCallback, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useEditTripStops } from '@/features/admin/trips/hooks'
import { useShops } from '@/features/admin/shops/hooks'
import { Card, SectionTitle } from '@/components/ui/list'
import { moveItem, newStopKey, type StopDraft } from '@/components/stops/drafts'
import type { Stop, Trip } from '@/lib/schemas'
import { stopName, StopRow } from '@/features/admin/trips/StopRow'

export function TripStopsSheet({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const shops = useShops()
  const edit = useEditTripStops(trip.id)

  const [draft, setDraft] = useState<StopDraft[]>([])
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [composedAt, setComposedAt] = useState<{ seq: number; version: number } | null>(null)

  const basisSeq = composedAt?.seq ?? trip.currentStopSeq
  const recorded = trip.routeSnapshot.stops.filter((s) => s.seq < basisSeq)

  const seed = useCallback(() => {
    setDraft(
      trip.routeSnapshot.stops
        .filter((s) => s.seq >= trip.currentStopSeq)
        .map((s) => ({
          key: newStopKey(),
          type: s.shopId ? ('shop' as const) : ('home' as const),
          shopId: s.shopId,
          label: s.label,
        })),
    )
    setReason('')
    setSubmitted(false)
    setComposedAt({ seq: trip.currentStopSeq, version: trip.routeVersion })
  }, [trip])

  useLayoutEffect(() => {
    if (open) seed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const finished = trip.status === 'completed'
  const movedOn =
    open &&
    composedAt !== null &&
    (finished ||
      trip.currentStopSeq !== composedAt.seq ||
      trip.routeVersion !== composedAt.version)

  const move = (index: number, by: -1 | 1) => setDraft((prev) => moveItem(prev, index, by))

  const shopsUnavailable = shops.isError && !shops.data

  const active = shops.data ? new Set(shops.data.filter((s) => s.active).map((s) => s.id)) : null

  const rowProblem = (d: StopDraft): string | null => {
    if (d.type === 'home') return d.label?.trim() ? null : 'Label this stop or remove it'
    if (!d.shopId) return 'Choose a place or remove this stop'
    if (active && !active.has(d.shopId)) {
      return 'This place is no longer active. Remove it or pick another.'
    }
    return null
  }
  const incomplete = draft.some((d) => rowProblem(d) !== null)
  const reasonMissing = reason.trim() === ''

  async function save() {
    setSubmitted(true)
    if (!composedAt || incomplete || reasonMissing || shopsUnavailable || finished) return

    const stops: Stop[] = draft.map((d, i) =>
      d.type === 'shop'
        ? { seq: i + 1, type: 'shop', shopId: d.shopId }
        : { seq: i + 1, type: 'home', label: d.label?.trim() },
    )

    try {
      await edit.mutateAsync({
        stops,
        fromStopSeq: composedAt.seq,
        routeVersion: composedAt.version,
        reason: reason.trim(),
      })
      onOpenChange(false)
    } catch {
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Change the remaining stops"
      description={`${trip.driverName} · ${recorded.length} already recorded`}
      footer={
        <Button size="lg" onClick={save} disabled={finished || shopsUnavailable} pending={edit.isPending} pendingLabel="Updating…">
          Update the route
        </Button>
      }
    >
      {movedOn ? (
        <div className="mb-5 rounded-card bg-suspect-soft px-4 py-3.5">
          <p className="text-callout leading-snug text-suspect">
            {trip.status === 'completed'
              ? `${trip.driverName} has completed this trip since you opened it, so its route can no longer change.`
              : `${trip.driverName} has moved on, or someone else changed this route, since you opened it. Saving now will be refused.`}
          </p>
          {finished ? null : (
            <Button variant="secondary" size="md" className="mt-3 w-full" onClick={seed}>
              Load the current stops
            </Button>
          )}
        </div>
      ) : null}

      {shopsUnavailable ? (
        <div className="mb-5 rounded-card bg-failed-soft px-4 py-3.5">
          <p className="text-callout leading-snug text-failed">
            The list of places could not be loaded, so the stops below cannot show their
            names. Reload before changing anything.
          </p>
          <Button variant="secondary" size="md" className="mt-3 w-full" onClick={() => shops.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {recorded.length > 0 ? (
        <section className="mb-6">
          <SectionTitle as="h3">Already recorded</SectionTitle>
          <Card className="opacity-60">
            {recorded.map((s) => (
              <div
                key={s.seq}
                className="flex min-h-[44px] items-center gap-3 border-b border-hairline px-4 last:border-b-0"
              >
                <span className="tnum w-5 shrink-0 text-footnote text-ink-3">{s.seq}</span>
                <span className="truncate text-subhead text-ink-2">{stopName(s)}</span>
              </div>
            ))}
          </Card>
          <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">
            These cannot change. The driver's photos and times are filed against them.
          </p>
        </section>
      ) : null}

      <section className="mb-6">
        <SectionTitle as="h3">
          Still to go{draft.length > 0 ? ` (${draft.length})` : ''}
        </SectionTitle>

        {draft.length === 0 ? (
          <p className="rounded-card bg-surface px-4 py-5 text-center text-callout leading-snug text-ink-2">
            {finished
              ? `${trip.driverName} has already completed this trip.`
              : `Nothing left. Saving this lets ${trip.driverName} complete the trip now.`}
          </p>
        ) : (
          <div className="space-y-2">
            {draft.map((d, i) => (
              <StopRow
                key={d.key}
                draft={d}
                seq={basisSeq + i}
                shops={shops.data ?? []}
                isNext={i === 0 && trip.status === 'in_progress' && !movedOn}
                problem={submitted ? rowProblem(d) : null}
                canMoveUp={i > 0}
                canMoveDown={i < draft.length - 1}
                onMove={(by) => move(i, by)}
                onChange={(p) =>
                  setDraft((prev) => prev.map((x) => (x.key === d.key ? { ...x, ...p } : x)))
                }
                onRemove={() => setDraft((prev) => prev.filter((x) => x.key !== d.key))}
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={() => setDraft((p) => [...p, { key: newStopKey(), type: 'shop', shopId: '' }])}
          >
            <Plus size={17} /> Place
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={() => setDraft((p) => [...p, { key: newStopKey(), type: 'home', label: '' }])}
          >
            <Plus size={17} /> Home stop
          </Button>
        </div>
      </section>

      <Card className="mb-4">
        <Field
          label="Reason"
          htmlFor="ts-reason"
          error={submitted && reasonMissing ? 'Say why the route is changing' : undefined}
          hint="Kept with the trip, so the timeline explains why the route ran differently."
        >
          <Input
            id="ts-reason"
            placeholder="Frozen warehouse closed early"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </Card>
    </Sheet>
  )
}
