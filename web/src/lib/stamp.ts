import { TIMEZONE, formatLocal } from '@/lib/format'
import { MIN_SHARPNESS, sharpness } from '@/lib/camera'

/** Turning a live frame into evidence. */

export type Capture = {
  blob: Blob
  width: number
  height: number
  sharpness: number
}

export class TooBlurry extends Error {
  readonly measured: number

  constructor(measured: number) {
    super('That photo is too blurred to use. Hold still, let the camera focus, and take it again.')
    this.name = 'TooBlurry'
    this.measured = measured
  }
}

const MAX_EDGE = 1600
const QUALITY = 0.82

const MEASURE_EDGE = 480

export type StampLines = {
  place: string
  takenAt: string
  position?: string
}

/** Draws the frame, measures it, stamps it, and encodes it. */
export async function captureFrame(
  video: HTMLVideoElement,
  lines: StampLines,
): Promise<Capture> {
  const sourceW = video.videoWidth
  const sourceH = video.videoHeight
  if (!sourceW || !sourceH) {
    throw new Error('The camera is not ready yet.')
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH))
  const width = Math.round(sourceW * scale)
  const height = Math.round(sourceH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process the photo.')
  ctx.drawImage(video, 0, 0, width, height)

  const measured = measureSharpness(canvas, width, height)
  if (measured < MIN_SHARPNESS) {
    throw new TooBlurry(measured)
  }

  drawStamp(ctx, width, height, lines)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('The photo could not be saved. Take it again.')

  return { blob, width, height, sharpness: measured }
}

function measureSharpness(source: HTMLCanvasElement, width: number, height: number): number {
  const scale = Math.min(1, MEASURE_EDGE / Math.max(width, height))
  const w = Math.max(3, Math.round(width * scale))
  const h = Math.max(3, Math.round(height * scale))

  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const ctx = small.getContext('2d')
  if (!ctx) return MIN_SHARPNESS
  ctx.drawImage(source, 0, 0, w, h)

  return sharpness(ctx.getImageData(0, 0, w, h))
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: StampLines,
) {
  const pad = Math.round(width * 0.025)
  const size = Math.max(14, Math.round(width * 0.032))
  const gap = Math.round(size * 0.35)
  const rows = lines.position ? 3 : 2
  const bandH = size * rows + gap * (rows - 1) + pad * 2

  ctx.save()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, height - bandH, width, bandH)

  ctx.font = `600 ${size}px -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'

  const top = height - bandH + pad
  ctx.fillText(truncate(ctx, lines.place, width - pad * 2), pad, top)

  ctx.font = `400 ${size}px -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillText(`${formatLocal(lines.takenAt)} ${TIMEZONE}`, pad, top + size + gap)

  if (lines.position) {
    const small = Math.round(size * 0.82)
    ctx.font = `400 ${small}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.fillText(
      truncate(ctx, lines.position, width - pad * 2),
      pad,
      top + (size + gap) * 2,
    )
  }

  ctx.restore()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text

  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}
