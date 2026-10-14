import { describe, expect, it, vi } from 'vitest'
import { captureFix, combineSamples, GpsError, type Sample } from '@/lib/gps'

describe('combineSamples', () => {
  it('weights a confident fix far above a vague one', () => {
    const samples: Sample[] = [
      { lat: 35.0, lng: 139.0, accuracyM: 10, speed: null, heading: null },
      { lat: 35.001, lng: 139.001, accuracyM: 40, speed: null, heading: null },
    ]
    const out = combineSamples(samples)

    expect(out.lat).toBeCloseTo(35.000058823529415, 12)
    expect(out.lng).toBeCloseTo(139.00005882352943, 12)
    expect(out.lat).toBeLessThan(35.0005)
  })

  it('reduces to the plain mean when every sample is equally confident', () => {
    const out = combineSamples([
      { lat: 35.0, lng: 139.0, accuracyM: 10, speed: null, heading: null },
      { lat: 35.002, lng: 139.002, accuracyM: 10, speed: null, heading: null },
    ])
    expect(out.lat).toBeCloseTo(35.001, 12)
  })

  it('reports the best accuracy seen, not the last or the average', () => {
    const out = combineSamples([
      { lat: 35, lng: 139, accuracyM: 48, speed: null, heading: null },
      { lat: 35, lng: 139, accuracyM: 6, speed: null, heading: null },
      { lat: 35, lng: 139, accuracyM: 22, speed: null, heading: null },
    ])
    expect(out.accuracyM).toBe(6)
    expect(out.sampleCount).toBe(3)
  })

  it('carries speed and heading from the most recent sample', () => {
    const out = combineSamples([
      { lat: 35, lng: 139, accuracyM: 10, speed: 5, heading: 90 },
      { lat: 35, lng: 139, accuracyM: 10, speed: 0, heading: 180 },
    ])
    expect(out.speed).toBe(0)
    expect(out.heading).toBe(180)
  })

  it('survives a reported accuracy of zero instead of dividing by it', () => {
    const out = combineSamples([{ lat: 35, lng: 139, accuracyM: 0, speed: null, heading: null }])
    expect(Number.isFinite(out.lat)).toBe(true)
    expect(out.lat).toBe(35)
  })

  it('refuses to invent a coordinate when there are no samples', () => {
    expect(() => combineSamples([])).toThrow(GpsError)
  })
})

function fakeGeolocation(
  script: (emit: (s: Partial<GeolocationCoordinates>) => void, failWith: (code: number) => void) => void,
): Geolocation {
  return {
    watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
      const emit = (coords: Partial<GeolocationCoordinates>) =>
        success({
          coords: { latitude: 0, longitude: 0, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, ...coords },
          timestamp: Date.now(),
        } as GeolocationPosition)
      const failWith = (code: number) => error?.({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      script(emit, failWith)
      return 1
    },
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  } as unknown as Geolocation
}

describe('captureFix', () => {
  it('resolves as soon as it has enough samples', async () => {
    const geo = fakeGeolocation((emit) => {
      emit({ latitude: 35.6839, longitude: 139.7744, accuracy: 12 })
      emit({ latitude: 35.6839, longitude: 139.7744, accuracy: 8 })
    })
    const fix = await captureFix({ geolocation: geo, minSamples: 2, windowMs: 50 })

    expect(fix.sampleCount).toBe(2)
    expect(fix.accuracyM).toBe(8)
    expect(fix.lat).toBeCloseTo(35.6839, 6)
    expect(() => new Date(fix.clientTime).toISOString()).not.toThrow()
  })

  it('uses what it has when the window closes early', async () => {
    const geo = fakeGeolocation((emit) => emit({ latitude: 35.1, longitude: 139.1, accuracy: 30 }))
    const fix = await captureFix({ geolocation: geo, minSamples: 6, windowMs: 30 })

    expect(fix.sampleCount).toBe(1)
  })

  it('skips readings with no usable accuracy rather than trusting them', async () => {
    const geo = fakeGeolocation((emit) => {
      emit({ latitude: 35.1, longitude: 139.1, accuracy: undefined as unknown as number })
      emit({ latitude: 35.2, longitude: 139.2, accuracy: 15 })
    })
    const fix = await captureFix({ geolocation: geo, minSamples: 1, windowMs: 50 })
    expect(fix.sampleCount).toBe(1)
    expect(fix.lat).toBeCloseTo(35.2, 6)
  })

  it('surfaces a denied permission as its own code', async () => {
    const geo = fakeGeolocation((_emit, failWith) => failWith(1))
    await expect(captureFix({ geolocation: geo, windowMs: 50 })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    })
  })

  it('reports a timeout when nothing at all arrived', async () => {
    const geo = fakeGeolocation((_emit, failWith) => failWith(3))
    await expect(captureFix({ geolocation: geo, windowMs: 50 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('treats a timeout after some fixes as success, not failure', async () => {
    const geo = fakeGeolocation((emit, failWith) => {
      emit({ latitude: 35.3, longitude: 139.3, accuracy: 20 })
      failWith(3)
    })
    const fix = await captureFix({ geolocation: geo, minSamples: 6, windowMs: 50 })
    expect(fix.sampleCount).toBe(1)
  })

  it('fails clearly on a device with no geolocation', async () => {
    await expect(captureFix({ geolocation: undefined as unknown as Geolocation, windowMs: 10 })).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    })
  })

  it('always stops watching, so the GPS is not left running', async () => {
    const geo = fakeGeolocation((emit) => emit({ latitude: 35, longitude: 139, accuracy: 10 }))
    await captureFix({ geolocation: geo, minSamples: 1, windowMs: 50 })
    expect(geo.clearWatch).toHaveBeenCalled()
  })
})

describe('captureFix retries', () => {
  function flakyGeolocation(failures: number, code = 3) {
    let attempt = 0
    return fakeGeolocation((emit, failWith) => {
      attempt += 1
      if (attempt <= failures) {
        failWith(code)
        return
      }
      emit({ accuracy: 8 })
    })
  }

  it('succeeds on the second attempt without telling anyone', async () => {
    const fix = await captureFix({
      geolocation: flakyGeolocation(1),
      windowMs: 20,
      minSamples: 1,
      retryDelayMs: 0,
    })
    expect(fix.sampleCount).toBe(1)
  })

  it('gives up after three attempts', async () => {
    await expect(
      captureFix({ geolocation: flakyGeolocation(99), windowMs: 20, minSamples: 1, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('reports which attempt it is on, so the screen can say so', async () => {
    const seen: string[] = []
    await captureFix({
      geolocation: flakyGeolocation(2),
      windowMs: 20,
      minSamples: 1,
      retryDelayMs: 0,
      onAttempt: (n, of) => seen.push(`${n}/${of}`),
    })
    expect(seen).toEqual(['1/3', '2/3', '3/3'])
  })

  it('does not retry a permission that was refused', async () => {
    let attempts = 0
    const geo = fakeGeolocation((_emit, failWith) => {
      attempts += 1
      failWith(1)
    })

    await expect(
      captureFix({ geolocation: geo, windowMs: 20, minSamples: 1, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(attempts).toBe(1)
  })

  it('does not retry a device that cannot do this at all', async () => {
    await expect(
      captureFix({ geolocation: undefined as unknown as Geolocation, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('retries a position that was merely unavailable', async () => {
    const fix = await captureFix({
      geolocation: flakyGeolocation(1, 2),
      windowMs: 20,
      minSamples: 1,
      retryDelayMs: 0,
    })
    expect(fix.sampleCount).toBe(1)
  })

  it('honours a caller that asks for one attempt only', async () => {
    let attempts = 0
    const geo = fakeGeolocation((_emit, failWith) => {
      attempts += 1
      failWith(3)
    })

    await expect(
      captureFix({ geolocation: geo, windowMs: 20, minSamples: 1, attempts: 1 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(attempts).toBe(1)
  })
})
