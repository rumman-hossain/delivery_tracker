/** Capturing proof, not accepting it. */

export type CameraError =
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA'
  | 'UNSUPPORTED'
  | 'IN_USE'
  | 'UNKNOWN'

export class CameraFailure extends Error {
  readonly code: CameraError

  constructor(code: CameraError, message: string) {
    super(message)
    this.name = 'CameraFailure'
    this.code = code
  }
}

const MESSAGES: Record<CameraError, string> = {
  PERMISSION_DENIED:
    'Camera access is off. Turn it on for this site in your browser settings, then try again.',
  NO_CAMERA: 'No camera was found on this device.',
  UNSUPPORTED: 'This browser cannot open the camera. Use Chrome or Safari on your phone.',
  IN_USE: 'Another app is using the camera. Close it and try again.',
  UNKNOWN: 'The camera could not be started. Try again.',
}

export const cameraMessage = (code: CameraError) => MESSAGES[code]

/** Opens the rear camera at a resolution worth keeping as evidence. */
export async function openCamera(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraFailure('UNSUPPORTED', MESSAGES.UNSUPPORTED)
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1600 },
        height: { ideal: 1200 },
      },
      audio: false,
    })
  } catch (error) {
    throw new CameraFailure(codeFor(error), MESSAGES[codeFor(error)])
  }
}

function codeFor(error: unknown): CameraError {
  const name = (error as DOMException)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'PERMISSION_DENIED'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'NO_CAMERA'
    case 'NotReadableError':
    case 'AbortError':
      return 'IN_USE'
    default:
      return 'UNKNOWN'
  }
}

export function closeCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

/** How sharp the frame is, as the variance of its Laplacian. */
export function sharpness(image: ImageData): number {
  const { data, width, height } = image

  const grey = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let sum = 0
  let sumSquares = 0
  let n = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      const value =
        4 * grey[p] - grey[p - 1] - grey[p + 1] - grey[p - width] - grey[p + width]
      sum += value
      sumSquares += value * value
      n++
    }
  }

  if (n === 0) return 0
  const mean = sum / n
  return sumSquares / n - mean * mean
}

/** Below this, a frame is refused. */
export const MIN_SHARPNESS = 12
