import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReachedFlow } from '@/features/driver/active-trip/ReachedFlow'
import type { Fix } from '@/lib/gps'
import type { NextStop } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const captureFix = vi.hoisted(() => vi.fn())
const uploadProofPhoto = vi.hoisted(() => vi.fn())
const postReached = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gps')>()),
  captureFix,
}))
vi.mock('@/lib/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo')>()),
  uploadProofPhoto,
}))
vi.mock('@/features/driver/api', () => ({ postReached }))

vi.mock('@/components/photo/CameraCapture', () => ({
  CameraCapture: ({
    shot,
    onShot,
  }: {
    shot: { blob: Blob } | null
    onShot: (s: { blob: Blob } | null) => void
  }) =>
    shot ? (
      <button type="button" onClick={() => onShot(null)}>
        Take it again
      </button>
    ) : (
      <button
        type="button"
        data-testid="take-photo"
        onClick={() =>
          onShot({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }) })
        }
      >
        Take the photo
      </button>
    ),
}))

const FIX: Fix = {
  lat: 35.7075,
  lng: 139.6637,
  accuracyM: 6.2,
  sampleCount: 7,
  speed: null,
  heading: null,
  clientTime: '2026-09-22T01:23:45.000Z',
}

const STOP: NextStop = {
  done: false,
  seq: 2,
  type: 'shop',
  shopName: 'Lawson Nakano',
  expectedLat: 35.7075,
  expectedLng: 139.6637,
  expectedRadiusM: 50,
}

function renderFlow(onOpenChange = vi.fn(), stop: NextStop = STOP) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ReachedFlow
        tripId="trip-1"
        stop={stop}
        open
        onOpenChange={onOpenChange}
        onRecorded={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const submitButton = () => screen.getByTestId('confirm-reached')

async function takePhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('take-photo'))
}

beforeEach(() => {
  vi.clearAllMocks()
  captureFix.mockResolvedValue(FIX)
  uploadProofPhoto.mockResolvedValue({ photoPath: 'trips/trip-1/2.jpg', bytes: 1234 })
  postReached.mockResolvedValue({
    eventId: 'ev-1',
    seq: 2,
    serverTime: '2026-09-22T01:23:46.000Z',
    distanceM: 12,
    matchStatus: 'matched',
    nextSeq: 3,
    tripStatus: 'in_progress',
  })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('ReachedFlow', () => {
  it('will not submit without a photo, however good the fix is', async () => {
    const user = userEvent.setup()
    renderFlow()

    await screen.findByText('Location locked')
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    expect(submitButton()).toBeDisabled()
    expect(screen.getByText('Take a photo of the delivery.')).toBeInTheDocument()

    await takePhoto(user)
    await waitFor(() => expect(submitButton()).toBeEnabled())
  })

  it('will not submit before the fix has settled', async () => {
    const user = userEvent.setup()
    captureFix.mockReturnValue(new Promise(() => {}))
    renderFlow()

    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    expect(submitButton()).toBeDisabled()
    expect(screen.getByText('Waiting for your location.')).toBeInTheDocument()
  })

  it('reuses one idempotency key across a retry of the same tap', async () => {
    const user = userEvent.setup()
    postReached.mockRejectedValueOnce(new Error('network died mid-flight'))
    renderFlow()

    await screen.findByText('Location locked')
    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    await user.click(submitButton())
    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(submitButton()).toBeEnabled())
    await user.click(submitButton())
    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(2))

    const [firstKey, secondKey] = postReached.mock.calls.map((call) => call[2])
    expect(firstKey).toEqual(expect.any(String))
    expect(firstKey).toHaveLength(36)
    expect(secondKey).toBe(firstKey)
  })

  it('sends the weighted fix and the uploaded path, and disables the button once recorded', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderFlow()

    await screen.findByText('Location locked')
    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Not delivered' }))
    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(postReached.mock.calls[0][1]).toMatchObject({
      seq: 2,
      lat: FIX.lat,
      lng: FIX.lng,
      accuracyM: FIX.accuracyM,
      sampleCount: FIX.sampleCount,
      clientTime: FIX.clientTime,
      deliveryStatus: 'failed',
      photoPath: 'trips/trip-1/2.jpg',
    })

    await waitFor(() => expect(submitButton()).toBeDisabled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not re-upload a photo that already made it to storage', async () => {
    const user = userEvent.setup()
    postReached.mockRejectedValueOnce(new Error('the tap failed after the upload'))
    renderFlow()

    await screen.findByText('Location locked')
    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    await user.click(submitButton())
    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitButton()).toBeEnabled())
    await user.click(submitButton())
    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(2))

    expect(uploadProofPhoto).toHaveBeenCalledTimes(1)
  })
})

describe('the match verdict', () => {
  it('proposes delivered when the driver is at the shop', async () => {
    renderFlow()

    await screen.findByText('Location locked')
    expect(await screen.findByText(`At ${STOP.shopName}`)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Delivered' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })

  it('proposes not delivered when the driver is somewhere else, and says why', async () => {
    captureFix.mockResolvedValue({ ...FIX, lat: 35.7105 })
    renderFlow()

    await screen.findByText('Location locked')
    expect(await screen.findByText(/from Lawson Nakano/)).toBeInTheDocument()
    expect(screen.getByText(/recorded as not delivered unless you say otherwise/i)).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Not delivered' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })

  it('does not overrule the driver once they have chosen', async () => {
    const user = userEvent.setup()
    captureFix.mockResolvedValue({ ...FIX, lat: 35.7105 })
    renderFlow()

    await screen.findByText('Location locked')
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    expect(screen.getByRole('radio', { name: 'Delivered' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sends what the driver wrote', async () => {
    const user = userEvent.setup()
    captureFix.mockResolvedValue({ ...FIX, lat: 35.7105 })
    renderFlow()

    await screen.findByText('Location locked')
    await user.type(
      screen.getByLabelText('What happened at this stop'),
      'Delivered to the loading bay at the back.',
    )
    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))
    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(postReached.mock.calls[0][1]).toMatchObject({
      deliveryStatus: 'delivered',
      note: 'Delivered to the loading bay at the back.',
    })
  })

  it('re-proposes when the fix is taken again', async () => {
    const user = userEvent.setup()
    captureFix.mockResolvedValueOnce({ ...FIX, lat: 35.7105 })
    renderFlow()

    await screen.findByText('Location locked')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Not delivered' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )

    captureFix.mockResolvedValue(FIX)
    await user.click(screen.getByRole('button', { name: 'Take the location again' }))

    expect(await screen.findByText(`At ${STOP.shopName}`)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Delivered' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })

  it('leaves the driver’s own choice alone when the fix is taken again', async () => {
    const user = userEvent.setup()
    renderFlow()

    await screen.findByText('Location locked')
    await user.click(screen.getByRole('radio', { name: 'Part of it' }))

    captureFix.mockResolvedValue({ ...FIX, lat: 35.7105 })
    await user.click(screen.getByRole('button', { name: 'Take the location again' }))

    await screen.findByText(/from Lawson Nakano/)
    expect(screen.getByRole('radio', { name: 'Part of it' })).toHaveAttribute('aria-checked', 'true')
  })

  it('judges nothing at a home stop', async () => {
    renderFlow(vi.fn(), { done: false, seq: 2, type: 'home', label: 'Driver’s home' })

    await screen.findByText('Location locked')
    expect(screen.queryByText(/Where you are/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Delivered' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('uploading the photo', () => {
  it('starts as soon as the photo is taken, before anything is recorded', async () => {
    const user = userEvent.setup()
    renderFlow()

    await screen.findByText('Location locked')
    expect(uploadProofPhoto).not.toHaveBeenCalled()

    await takePhoto(user)

    await waitFor(() => expect(uploadProofPhoto).toHaveBeenCalledTimes(1))
    expect(postReached).not.toHaveBeenCalled()
    expect(await screen.findByText(/photo sent/i)).toBeInTheDocument()
  })

  it('records with the path the eager upload produced, without a second upload', async () => {
    const user = userEvent.setup()
    renderFlow()

    await screen.findByText('Location locked')
    await takePhoto(user)
    await screen.findByText(/photo sent/i)
    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(uploadProofPhoto).toHaveBeenCalledTimes(1)
    expect(postReached.mock.calls[0][1]).toMatchObject({ photoPath: 'trips/trip-1/2.jpg' })
  })

  it('ignores an upload the driver has already replaced', async () => {
    const user = userEvent.setup()
    let finishFirst: (r: { photoPath: string; bytes: number }) => void = () => {}
    uploadProofPhoto.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
    uploadProofPhoto.mockResolvedValue({ photoPath: 'trips/trip-1/2-retake.jpg', bytes: 99 })

    renderFlow()
    await screen.findByText('Location locked')

    await takePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Take it again' }))
    await takePhoto(user)
    await screen.findByText(/photo sent/i)

    finishFirst({ photoPath: 'trips/trip-1/2-stale.jpg', bytes: 1 })

    await user.click(submitButton())
    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(postReached.mock.calls[0][1]).toMatchObject({ photoPath: 'trips/trip-1/2-retake.jpg' })
  })

  it('aborts the upload it replaced, not just its result', async () => {
    const user = userEvent.setup()
    const signals: AbortSignal[] = []
    uploadProofPhoto.mockImplementation((_t, _s, _b, _p, signal) => {
      signals.push(signal)
      return new Promise((resolve) => {
        signal?.addEventListener('abort', () => resolve({ photoPath: 'never', bytes: 0 }))
      })
    })

    renderFlow()
    await screen.findByText('Location locked')
    await takePhoto(user)
    await waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0].aborted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Take it again' }))

    await waitFor(() => expect(signals[0].aborted).toBe(true))
  })

  it('waits for an upload still in flight rather than starting another', async () => {
    const user = userEvent.setup()
    let finish: (r: { photoPath: string; bytes: number }) => void = () => {}
    uploadProofPhoto.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))

    renderFlow()
    await screen.findByText('Location locked')
    await takePhoto(user)
    await screen.findByText(/sending the photo/i)

    await user.click(submitButton())
    expect(postReached).not.toHaveBeenCalled()
    expect(uploadProofPhoto).toHaveBeenCalledTimes(1)

    finish({ photoPath: 'trips/trip-1/2.jpg', bytes: 1234 })

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(uploadProofPhoto).toHaveBeenCalledTimes(1)
  })

  it('retries an upload that failed before the driver got there', async () => {
    const user = userEvent.setup()
    uploadProofPhoto.mockRejectedValueOnce(new Error('the connection dropped'))

    renderFlow()
    await screen.findByText('Location locked')
    await takePhoto(user)

    expect(await screen.findByText(/did not upload/i)).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()

    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(uploadProofPhoto).toHaveBeenCalledTimes(2)
    expect(postReached.mock.calls[0][1]).toMatchObject({ photoPath: 'trips/trip-1/2.jpg' })
  })
})

describe('a home delivery', () => {
  const HOME: NextStop = { done: false, seq: 2, type: 'home', label: 'Tanaka-san, 3F' }

  it('can be recorded without a photo', async () => {
    const user = userEvent.setup()
    renderFlow(vi.fn(), HOME)

    await screen.findByText('Location locked')
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    expect(submitButton()).toBeEnabled()
    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(uploadProofPhoto).not.toHaveBeenCalled()
    expect(postReached.mock.calls[0][1].photoPath).toBeUndefined()
  })

  it('still offers the camera, and uses a photo if one was taken', async () => {
    const user = userEvent.setup()
    renderFlow(vi.fn(), HOME)

    await screen.findByText('Location locked')
    expect(screen.getByText('Photo (optional)')).toBeInTheDocument()

    await takePhoto(user)
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))
    await user.click(submitButton())

    await waitFor(() => expect(postReached).toHaveBeenCalledTimes(1))
    expect(postReached.mock.calls[0][1].photoPath).toBe('trips/trip-1/2.jpg')
  })

  it('does not relax the rule at a shop', async () => {
    const user = userEvent.setup()
    renderFlow()

    await screen.findByText('Location locked')
    await user.click(screen.getByRole('radio', { name: 'Delivered' }))

    expect(submitButton()).toBeDisabled()
    expect(screen.getByText('Take a photo of the delivery.')).toBeInTheDocument()
  })
})
