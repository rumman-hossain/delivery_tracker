import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Segmented, Textarea } from '@/components/ui/field'
import { CameraCapture } from '@/components/photo/CameraCapture'
import { Sheet } from '@/components/ui/sheet'
import { postReached } from '@/features/driver/api'
import { ApiError } from '@/lib/errors'
import { formatAccuracy, formatDistance } from '@/lib/format'
import { judge, type Verdict } from '@/lib/geo'
import { captureFix, GpsError } from '@/lib/gps'
import { qk } from '@/lib/query/queryKeys'
import { PhotoReplaced, uploadProofPhoto } from '@/lib/photo'
import { SectionTitle } from '@/components/ui/list'
import type { Delivery, NextStop } from '@/lib/schemas'
import { type GpsState, type UploadState } from '@/features/driver/active-trip/types'
import { VerdictBlock } from '@/features/driver/active-trip/VerdictBlock'
import { UploadLine } from '@/features/driver/active-trip/UploadLine'
import { GpsBlock } from '@/features/driver/active-trip/GpsBlock'

type Props = {
  tripId: string
  stop: NextStop
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}

const MAX_NOTE = 280

const OUTCOMES: { value: Delivery; label: string; tone: 'matched' | 'suspect' | 'failed' }[] = [
  { value: 'delivered', label: 'Delivered', tone: 'matched' },
  { value: 'partial', label: 'Part of it', tone: 'suspect' },
  { value: 'failed', label: 'Not delivered', tone: 'failed' },
]

export function ReachedFlow({ tripId, stop, open, onOpenChange, onRecorded }: Props) {
  const qc = useQueryClient()
  const seq = stop.seq ?? 0

  const [gps, setGps] = useState<GpsState>({
    kind: 'capturing',
    sampleCount: 0,
    bestAccuracyM: null,
    attempt: 1,
    attempts: 1,
  })
  const [shot, setShot] = useState<{ blob: Blob } | null>(null)
  const [upload, setUpload] = useState<UploadState>({ kind: 'none' })
  const [outcome, setOutcome] = useState<Delivery | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recorded, setRecorded] = useState(false)

  const idempotencyKey = useRef<string>('')

  const uploadTicket = useRef(0)
  const inFlight = useRef<Promise<string> | null>(null)
  const aborter = useRef<AbortController | null>(null)

  const cancelUpload = useCallback(() => {
    uploadTicket.current++
    aborter.current?.abort()
    aborter.current = null
    inFlight.current = null
  }, [])

  const startUpload = useCallback(
    (blob: Blob) => {
      const ticket = ++uploadTicket.current
      const mine = () => ticket === uploadTicket.current

      const controller = new AbortController()
      aborter.current = controller

      setUpload({ kind: 'uploading', fraction: 0 })
      const attempt = uploadProofPhoto(
        tripId,
        seq,
        blob,
        (fraction) => {
          if (mine()) setUpload({ kind: 'uploading', fraction })
        },
        controller.signal,
      )
        .then(({ photoPath }) => {
          if (mine()) setUpload({ kind: 'done', path: photoPath })
          return photoPath
        })
        .catch((error: unknown) => {
          if (mine()) {
            setUpload({
              kind: 'failed',
              message: error instanceof ApiError ? error.message : 'The photo did not upload.',
            })
          }
          throw error
        })

      inFlight.current = attempt
      return attempt
    },
    [tripId, seq],
  )

  const chosen = useRef(false)

  const captureTicket = useRef(0)

  const runCapture = useCallback(() => {
    const ticket = ++captureTicket.current
    const mine = () => ticket === captureTicket.current

    let attempt = 1
    let attempts = 1
    setGps({ kind: 'capturing', sampleCount: 0, bestAccuracyM: null, attempt, attempts })

    captureFix({
      onAttempt: (n, of) => {
        attempt = n
        attempts = of
        if (mine()) setGps({ kind: 'capturing', sampleCount: 0, bestAccuracyM: null, attempt, attempts })
      },
      onSample: (p) => {
        if (mine()) {
          setGps({
            kind: 'capturing',
            sampleCount: p.sampleCount,
            bestAccuracyM: p.bestAccuracyM,
            attempt,
            attempts,
          })
        }
      },
    })
      .then((fix) => {
        if (mine()) setGps({ kind: 'ready', fix })
      })
      .catch((err: unknown) => {
        if (!mine()) return
        setGps({
          kind: 'error',
          message: err instanceof GpsError ? err.message : 'Could not get your location.',
        })
      })
  }, [])

  useEffect(() => {
    if (!open) return
    idempotencyKey.current = crypto.randomUUID()
    setShot(null)
    cancelUpload()
    setUpload({ kind: 'none' })
    setOutcome(null)
    chosen.current = false
    setNote('')
    setRecorded(false)
    setSubmitting(false)
    runCapture()
    return () => {
      captureTicket.current++
      cancelUpload()
    }
  }, [open, seq, runCapture, cancelUpload])

  const onShot = (next: { blob: Blob } | null) => {
    setShot(next)
    cancelUpload()

    if (!next) {
      setUpload({ kind: 'none' })
      return
    }
    void startUpload(next.blob).catch(() => {})
  }

  const verdict: Verdict = gps.kind === 'ready' ? judge(stop, gps.fix) : { kind: 'none' }

  useEffect(() => {
    if (verdict.kind === 'none' || chosen.current) return
    setOutcome(verdict.kind === 'at' ? 'delivered' : 'failed')
  }, [verdict.kind])

  const photoRequired = stop.type !== 'home'
  const ready = gps.kind === 'ready' && (!!shot || !photoRequired) && !!outcome && !recorded

  async function ensurePhoto(blob: Blob): Promise<string> {
    if (upload.kind === 'done') return upload.path
    if (inFlight.current) {
      try {
        return await inFlight.current
      } catch (error) {
        if (error instanceof PhotoReplaced) throw error
      }
    }
    return startUpload(blob)
  }

  async function submit() {
    if (!ready || gps.kind !== 'ready' || !outcome) return
    setSubmitting(true)
    try {
      const path = shot ? await ensurePhoto(shot.blob) : undefined

      const { fix } = gps
      await postReached(
        tripId,
        {
          seq,
          lat: fix.lat,
          lng: fix.lng,
          accuracyM: fix.accuracyM,
          sampleCount: fix.sampleCount,
          speed: fix.speed,
          heading: fix.heading,
          clientTime: fix.clientTime,
          deliveryStatus: outcome,
          photoPath: path,
          note: note.trim() || undefined,
        },
        idempotencyKey.current,
      )

      setRecorded(true)
      qc.invalidateQueries({ queryKey: qk.nextStop(tripId) })
      qc.invalidateQueries({ queryKey: qk.myTrips })
      toast.success(`Stop ${seq} recorded`)
      onRecorded()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof PhotoReplaced
          ? error.message
          : 'Could not record this stop.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const title = stop.type === 'home' ? (stop.label ?? 'Home stop') : (stop.shopName ?? 'Stop')

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`Stop ${seq}`}
      footer={
        <Button
          size="lg"
          onClick={submit}
          disabled={!ready || submitting}
          data-testid="confirm-reached"
        >
          {submitting ? 'Recording…' : recorded ? 'Recorded' : 'Record this stop'}
        </Button>
      }
    >
      <GpsBlock state={gps} onRetry={runCapture} />

      <VerdictBlock verdict={verdict} place={title} />

      <section className="mb-6">
        <SectionTitle as="h3">
          {photoRequired ? 'Proof photo' : 'Photo (optional)'}
        </SectionTitle>
        <CameraCapture place={title} position={stampPosition(gps, verdict)} shot={shot} onShot={onShot} />
        <UploadLine state={upload} />
      </section>

      <section className="mb-6">
        <SectionTitle as="h3">What happened here</SectionTitle>
        <Segmented
          name="Delivery outcome"
          options={OUTCOMES}
          value={outcome}
          onChange={(v) => {
            chosen.current = true
            setOutcome(v)
          }}
        />
      </section>

      <section className="mb-6">
        <SectionTitle as="h3">
          {verdict.kind === 'away' ? 'Say what happened' : 'Anything to add'}
        </SectionTitle>
        <div className="rounded-card bg-surface px-4 py-2">
          <Textarea
            aria-label="What happened at this stop"
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              verdict.kind === 'away'
                ? 'Delivered to the loading bay at the back.'
                : 'Optional'
            }
          />
        </div>
      </section>

      {!ready && !recorded ? (
        <p className="mb-4 px-1 text-footnote text-ink-3">
          {missingHint(gps, shot, outcome, photoRequired)}
        </p>
      ) : null}
    </Sheet>
  )
}

function stampPosition(gps: GpsState, verdict: Verdict): string | undefined {
  if (gps.kind !== 'ready') return undefined

  const { lat, lng, accuracyM } = gps.fix
  const parts = [`${lat.toFixed(6)}, ${lng.toFixed(6)}`, formatAccuracy(accuracyM)]
  if (verdict.kind !== 'none') {
    parts.push(
      verdict.kind === 'at'
        ? `${formatDistance(verdict.distanceM)} from shop`
        : `${formatDistance(verdict.distanceM)} away — off site`,
    )
  }
  return parts.join(' · ')
}

function missingHint(
  gps: GpsState,
  shot: unknown,
  outcome: Delivery | null,
  photoRequired: boolean,
): string {
  if (gps.kind === 'capturing') return 'Waiting for your location.'
  if (gps.kind === 'error') return 'Fix your location first.'
  if (!shot && photoRequired) return 'Take a photo of the delivery.'
  if (!outcome) return 'Say what happened at this stop.'
  return ''
}
