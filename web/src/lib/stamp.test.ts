import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MIN_SHARPNESS, sharpness } from '@/lib/camera'
import { captureFrame, TooBlurry } from '@/lib/stamp'

describe('sharpness', () => {
  const imageFrom = (draw: (set: (x: number, y: number, v: number) => void) => void, size = 64) => {
    const data = new Uint8ClampedArray(size * size * 4)
    const set = (x: number, y: number, v: number) => {
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
    draw(set)
    return { data, width: size, height: size } as ImageData
  }

  it('is near zero for a flat field, which has no edges at all', () => {
    const flat = imageFrom((set) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) set(x, y, 128)
    })
    expect(sharpness(flat)).toBeLessThan(1)
  })

  it('is high for a hard edge', () => {
    const edged = imageFrom((set) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) set(x, y, x < 32 ? 0 : 255)
    })
    expect(sharpness(edged)).toBeGreaterThan(MIN_SHARPNESS)
  })

  it('collapses when that edge is blurred', () => {
    const hard = imageFrom((set) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) set(x, y, x < 32 ? 0 : 255)
    })
    const soft = imageFrom((set) => {
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          set(x, y, Math.max(0, Math.min(255, (x - 16) * 8)))
        }
      }
    })
    expect(sharpness(soft)).toBeLessThan(sharpness(hard))
    expect(sharpness(soft)).toBeLessThan(MIN_SHARPNESS)
  })
})

describe('captureFrame', () => {
  let drawn: string[]
  let imageData: ImageData
  let toBlob: ReturnType<typeof vi.fn>

  const stubCanvas = () => {
    drawn = []
    toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/jpeg' })))

    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return {} as HTMLElement
      return {
        width: 0,
        height: 0,
        toBlob,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => imageData,
          fillRect: vi.fn(),
          fillText: vi.fn((t: string) => drawn.push(t)),
          measureText: () => ({ width: 10 }),
          save: vi.fn(),
          restore: vi.fn(),
          set font(_v: string) {},
          set fillStyle(_v: string) {},
          set textBaseline(_v: string) {},
        }),
      } as unknown as HTMLCanvasElement
    }) as typeof document.createElement)
  }

  const video = { videoWidth: 1600, videoHeight: 1200 } as HTMLVideoElement
  const lines = { place: 'Corner Market North', takenAt: '2026-09-22T01:23:45.000Z' }

  const flat = (v: number, size = 32) => {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
    return { data, width: size, height: size } as ImageData
  }

  const checkered = (size = 32) => {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const v = (x + y) % 2 ? 255 : 0
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = 255
      }
    }
    return { data, width: size, height: size } as ImageData
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    stubCanvas()
  })

  it('refuses a frame nobody could read', async () => {
    imageData = flat(128)
    await expect(captureFrame(video, lines)).rejects.toBeInstanceOf(TooBlurry)
  })

  it('does not stamp a frame it refuses', async () => {
    imageData = flat(128)
    await expect(captureFrame(video, lines)).rejects.toBeInstanceOf(TooBlurry)
    expect(drawn).toHaveLength(0)
    expect(toBlob).not.toHaveBeenCalled()
  })

  it('burns the place and the time into an acceptable frame', async () => {
    imageData = checkered()
    const capture = await captureFrame(video, lines)

    expect(capture.blob.type).toBe('image/jpeg')
    expect(drawn.some((t) => t.includes('Corner Market North'))).toBe(true)
    expect(drawn.some((t) => t.includes('2026-09-22') && t.includes('Asia/Tokyo'))).toBe(true)
  })

  it('refuses a camera that has not produced a frame yet', async () => {
    imageData = checkered()
    await expect(
      captureFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, lines),
    ).rejects.toThrow(/not ready/i)
  })
})
