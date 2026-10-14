import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input, Segmented, Textarea } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import type { EffectiveEvent } from '@/lib/events'
import { formatLocalTime } from '@/lib/format'
import { useCreateCorrection } from '@/features/admin/trips/hooks'
import { ran } from '@/lib/query/mutations'
import { Card, SectionTitle } from '@/components/ui/list'
import type { Delivery, Match } from '@/lib/schemas'

const MATCH_OPTIONS: { value: Match; label: string; tone: 'matched' | 'suspect' | 'failed' }[] = [
  { value: 'matched', label: 'At the shop', tone: 'matched' },
  { value: 'suspect', label: 'Away', tone: 'suspect' },
  { value: 'na', label: 'Not checked', tone: 'matched' },
]

const DELIVERY_OPTIONS: {
  value: Delivery
  label: string
  tone: 'matched' | 'suspect' | 'failed'
}[] = [
  { value: 'delivered', label: 'Delivered', tone: 'matched' },
  { value: 'partial', label: 'Part of it', tone: 'suspect' },
  { value: 'failed', label: 'Not delivered', tone: 'failed' },
]

export function CorrectionSheet({
  tripId,
  event,
  stopName,
  onOpenChange,
}: {
  tripId: string
  event: EffectiveEvent | null
  stopName: string
  onOpenChange: (open: boolean) => void
}) {
  const correct = useCreateCorrection(tripId)

  const [match, setMatch] = useState<Match | null>(null)
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [distance, setDistance] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!event) return
    setMatch(event.matchStatus ?? null)
    setDelivery(event.deliveryStatus ?? null)
    setDistance(event.distanceM === null || event.distanceM === undefined ? '' : String(Math.round(event.distanceM)))
    setReason('')
    setSubmitted(false)
  }, [event])

  if (!event) return null

  const changes: Record<string, unknown> = {}
  if (match && match !== event.matchStatus) changes.matchStatus = match
  if (delivery && delivery !== event.deliveryStatus) changes.deliveryStatus = delivery

  const originalDistance =
    event.distanceM === null || event.distanceM === undefined ? '' : String(Math.round(event.distanceM))
  if (distance !== originalDistance) {
    changes.distanceM = distance.trim() === '' ? null : Number(distance)
  }

  const distanceInvalid =
    distance.trim() !== '' && (!Number.isFinite(Number(distance)) || Number(distance) < 0)
  const nothingChanged = Object.keys(changes).length === 0
  const reasonMissing = reason.trim() === ''

  async function save() {
    setSubmitted(true)
    if (distanceInvalid || nothingChanged || reasonMissing) return

    const ok = await ran(() =>
      correct.mutateAsync({
        targetEventId: event!.id,
        changes,
        reason: reason.trim(),
      }),
    )
    if (ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={!!event}
      onOpenChange={onOpenChange}
      title={`Correct ${stopName}`}
      description={`Recorded at ${formatLocalTime(event.serverTime)}`}
      footer={
        <Button size="lg" onClick={save} pending={correct.isPending} pendingLabel="Saving…">
          Save correction
        </Button>
      }
    >
      <section className="mb-6">
        <SectionTitle as="h3">Delivery outcome</SectionTitle>
        <Segmented
          name="Delivery outcome"
          options={DELIVERY_OPTIONS}
          value={delivery}
          onChange={setDelivery}
        />
      </section>

      <section className="mb-6">
        <SectionTitle as="h3">Location match</SectionTitle>
        <Segmented name="Location match" options={MATCH_OPTIONS} value={match} onChange={setMatch} />
      </section>

      <Card className="mb-6">
        <Field
          label="Distance"
          htmlFor="c-distance"
          error={submitted && distanceInvalid ? 'Use a distance in metres, or leave it blank' : undefined}
          hint="Blank means no distance was measured, as at a home stop."
        >
          <div className="flex items-center gap-1">
            <Input
              id="c-distance"
              inputMode="numeric"
              className="tnum text-right"
              placeholder="—"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
            <span className="shrink-0 text-body text-ink-3">m</span>
          </div>
        </Field>
      </Card>

      <Card className="mb-4">
        <Field
          label="Reason"
          htmlFor="c-reason"
          error={submitted && reasonMissing ? 'Say why this is being corrected' : undefined}
          hint="Kept with the correction. Whoever reads this trip later needs to know why it changed."
        >
          <Textarea
            id="c-reason"
            placeholder="The shop pin was wrong, not the driver"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </Card>

      {submitted && nothingChanged ? (
        <p role="alert" className="mb-4 px-1 text-footnote text-failed">
          Change a value before saving.
        </p>
      ) : (
        <p className="mb-4 px-1 text-footnote leading-snug text-ink-3">
          The driver's original capture is kept. This is recorded alongside it as a
          correction, and the timeline will show that the stop was edited.
        </p>
      )}
    </Sheet>
  )
}
