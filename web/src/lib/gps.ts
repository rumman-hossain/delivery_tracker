/** Multi-sample GPS capture. */

export type Fix = {
  lat: number
  lng: number
  accuracyM: number
  sampleCount: number
  speed: number | null
  heading: number | null
  clientTime: string
}

export type GpsErrorCode = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED'

export class GpsError extends Error {
  readonly code: GpsErrorCode

  constructor(code: GpsErrorCode, message: string) {
    super(message)
    this.name = 'GpsError'
    this.code = code
  }
}

const GPS_MESSAGES: Record<GpsErrorCode, string> = {
  PERMISSION_DENIED: 'Location access is off. Turn it on for this site, then try again.',
  POSITION_UNAVAILABLE: 'Your location is not available right now. Move outside if you can.',
  TIMEOUT: 'Could not get a location fix. Move somewhere with a clearer view of the sky.',
  UNSUPPORTED: 'This device cannot provide a location.',
}

export type Sample = {
  lat: number
  lng: number
  accuracyM: number
  speed: number | null
  heading: number | null
}

/** Combines samples by inverse-variance weighting. */
export function combineSamples(samples: Sample[]): Omit<Fix, 'clientTime'> {
  if (samples.length === 0) {
    throw new GpsError('POSITION_UNAVAILABLE', GPS_MESSAGES.POSITION_UNAVAILABLE)
  }

  let sumW = 0
  let sumLat = 0
  let sumLng = 0
  let best = Number.POSITIVE_INFINITY

  for (const s of samples) {
    const acc = s.accuracyM > 0 ? s.accuracyM : 0.1
    const w = 1 / (acc * acc)
    sumW += w
    sumLat += s.lat * w
    sumLng += s.lng * w
    if (s.accuracyM < best) best = s.accuracyM
  }

  const last = samples[samples.length - 1]
  return {
    lat: sumLat / sumW,
    lng: sumLng / sumW,
    accuracyM: best,
    sampleCount: samples.length,
    speed: last.speed,
    heading: last.heading,
  }
}

export type CaptureOptions = {
  windowMs?: number
  minSamples?: number
  geolocation?: Geolocation
  onSample?: (progress: { sampleCount: number; bestAccuracyM: number }) => void
  attempts?: number
  onAttempt?: (attempt: number, of: number) => void
  retryDelayMs?: number
}

const DEFAULT_WINDOW_MS = 3500
const DEFAULT_MIN_SAMPLES = 6
const DEFAULT_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 400

const RETRYABLE: ReadonlySet<GpsErrorCode> = new Set(['TIMEOUT', 'POSITION_UNAVAILABLE'])

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Captures a fix, trying more than once when the failure is the kind that passes. */
export async function captureFix(opts: CaptureOptions = {}): Promise<Fix> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS)
  const delay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  for (let attempt = 1; ; attempt++) {
    opts.onAttempt?.(attempt, attempts)
    try {
      return await captureOnce(opts)
    } catch (err) {
      const retryable = err instanceof GpsError && RETRYABLE.has(err.code)
      if (!retryable || attempt >= attempts) throw err
      if (delay > 0) await wait(delay)
    }
  }
}

function captureOnce(opts: CaptureOptions): Promise<Fix> {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES
  const geo = opts.geolocation ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined)

  return new Promise<Fix>((resolve, reject) => {
    if (!geo) {
      reject(new GpsError('UNSUPPORTED', GPS_MESSAGES.UNSUPPORTED))
      return
    }

    const samples: Sample[] = []
    let settled = false
    let watchId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let cleanedUpEarly = false

    const cleanup = () => {
      if (watchId !== undefined) geo.clearWatch(watchId)
      else cleanedUpEarly = true
      if (timer !== undefined) clearTimeout(timer)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        resolve({ ...combineSamples(samples), clientTime: new Date().toISOString() })
      } catch (err) {
        reject(err)
      }
    }

    const fail = (code: GpsErrorCode) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new GpsError(code, GPS_MESSAGES[code]))
    }

    timer = setTimeout(() => {
      if (samples.length > 0) finish()
      else fail('TIMEOUT')
    }, windowMs)

    watchId = geo.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy
        if (typeof acc !== 'number' || Number.isNaN(acc)) return

        samples.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: acc,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
        })
        opts.onSample?.({
          sampleCount: samples.length,
          bestAccuracyM: Math.min(...samples.map((x) => x.accuracyM)),
        })

        if (samples.length >= minSamples) finish()
      },
      (err) => {
        switch (err.code) {
          case 1:
            fail('PERMISSION_DENIED')
            return
          case 3:
            if (samples.length > 0) finish()
            else fail('TIMEOUT')
            return
          default:
            if (samples.length > 0) finish()
            else fail('POSITION_UNAVAILABLE')
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    )

    if (cleanedUpEarly) geo.clearWatch(watchId)
  })
}
