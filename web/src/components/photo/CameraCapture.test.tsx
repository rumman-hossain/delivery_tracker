import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CameraCapture } from '@/components/photo/CameraCapture'
import { CameraFailure } from '@/lib/camera'
import { TooBlurry } from '@/lib/stamp'

const { openCamera, closeCamera, captureFrame } = vi.hoisted(() => ({
  openCamera: vi.fn(),
  closeCamera: vi.fn(),
  captureFrame: vi.fn(),
}))

vi.mock('@/lib/camera', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/camera')>()),
  openCamera,
  closeCamera,
}))
vi.mock('@/lib/stamp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stamp')>()),
  captureFrame,
}))

const fakeStream = () => ({ getTracks: () => [] }) as unknown as MediaStream

function Host({ onChange }: { onChange?: (s: unknown) => void } = {}) {
  const [shot, setShot] = useState<{ blob: Blob } | null>(null)
  return (
    <CameraCapture
      place="Lawson Nakano"
      shot={shot}
      onShot={(next) => {
        setShot(next)
        onChange?.(next)
      }}
    />
  )
}

const takeButton = () => screen.getByTestId('take-photo')

beforeEach(() => {
  vi.clearAllMocks()
  openCamera.mockResolvedValue(fakeStream())
  closeCamera.mockImplementation((s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop()))
  captureFrame.mockResolvedValue({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }) })
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('CameraCapture', () => {
  it('takes a frame, stamped with the place', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)

    await waitFor(() => expect(takeButton()).toBeEnabled())
    await user.click(takeButton())

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toMatchObject({ blob: expect.any(Blob) })
    expect(await screen.findByAltText('The photo you just took')).toHaveAttribute(
      'src',
      'blob:preview',
    )
    expect(captureFrame.mock.calls[0][1]).toMatchObject({ place: 'Lawson Nakano' })
    expect(captureFrame.mock.calls[0][1].takenAt).toEqual(expect.any(String))
  })

  it('refuses a blurred frame and keeps the viewfinder open', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    captureFrame.mockRejectedValueOnce(new TooBlurry(3.1))
    render(<Host onChange={onChange} />)

    await waitFor(() => expect(takeButton()).toBeEnabled())
    await user.click(takeButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/too blurred to use/i)
    expect(onChange).not.toHaveBeenCalled()
    expect(takeButton()).toBeInTheDocument()
  })

  it('closes the camera once there is a photo', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await waitFor(() => expect(takeButton()).toBeEnabled())
    await user.click(takeButton())

    await waitFor(() => expect(closeCamera).toHaveBeenCalled())
    expect(screen.queryByTestId('take-photo')).not.toBeInTheDocument()
  })

  it('reopens the camera on a retake and lets go of the old preview', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await waitFor(() => expect(takeButton()).toBeEnabled())
    await user.click(takeButton())

    const retake = await screen.findByRole('button', { name: 'Take it again' })
    openCamera.mockClear()
    await user.click(retake)

    await waitFor(() => expect(takeButton()).toBeInTheDocument())
    expect(openCamera).toHaveBeenCalled()
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview'))
  })

  it('stops a stream that arrives after it has been dismissed', async () => {
    const tracks = [{ stop: vi.fn() }]
    let grant: (s: MediaStream) => void = () => {}
    openCamera.mockReturnValueOnce(new Promise<MediaStream>((resolve) => (grant = resolve)))
    const { unmount } = render(<Host />)
    unmount()

    grant({ getTracks: () => tracks } as unknown as MediaStream)
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled())
  })

  it('says what to do when the camera is refused, and offers no way round it', async () => {
    const user = userEvent.setup()
    openCamera.mockRejectedValueOnce(
      new CameraFailure('PERMISSION_DENIED', 'Camera access is off. Turn it on for this site.'),
    )
    render(<Host />)

    expect(await screen.findByText(/camera access is off/i)).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    openCamera.mockResolvedValue(fakeStream())
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(takeButton()).toBeEnabled())
  })
})
