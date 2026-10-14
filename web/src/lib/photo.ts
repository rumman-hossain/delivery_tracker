import { confirmUserPhoto, getUserPhotoUploadURL } from '@/features/admin/users/api'
import { getPhotoUploadURL } from '@/features/driver/api'
import { ApiError, OFFLINE_MESSAGE } from '@/lib/errors'

/** The proof-photo upload. */

export const PHOTO_CONTENT_TYPE = 'image/jpeg'

const MAX_EDGE = 1600
const QUALITY = 0.72

/** Matches domain.MaxPhotoBytes. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Re-encodes smaller. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, PHOTO_CONTENT_TYPE, QUALITY),
    )
    return blob && blob.size < file.size ? blob : file
  } finally {
    bitmap.close()
  }
}

export type UploadResult = { photoPath: string; bytes: number }

/** Compress, mint a signed URL, PUT the bytes, return the path to send with `reached`. */
export async function uploadProofPhoto(
  tripId: string,
  seq: number,
  file: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return putThroughSignedURL(file, () => getPhotoUploadURL(tripId, seq), onProgress, signal)
}

/** A person's photo, uploaded and then confirmed. */
export async function uploadUserPhoto(
  uid: string,
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const result = await putThroughSignedURL(file, () => getUserPhotoUploadURL(uid), onProgress)
  await confirmUserPhoto(uid)
  return result
}

/** Thrown when an upload is abandoned because its frame was replaced. */
export class PhotoReplaced extends Error {
  constructor() {
    super('That photo was replaced. Take the stop again.')
    this.name = 'PhotoReplaced'
  }
}

async function putThroughSignedURL(
  file: Blob,
  mintURL: () => Promise<{ uploadURL: string; photoPath: string }>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const blob = file.size <= MAX_UPLOAD_BYTES ? file : await compressPhoto(file)
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ApiError('BAD_REQUEST', 400, 'That photo is too large to upload. Take another one.')
  }

  const { uploadURL, photoPath } = await mintURL()

  if (signal?.aborted) throw new PhotoReplaced()

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    signal?.addEventListener('abort', abort, { once: true })
    xhr.onloadend = () => signal?.removeEventListener('abort', abort)
    xhr.onabort = () => reject(new PhotoReplaced())
    xhr.open('PUT', uploadURL, true)
    xhr.setRequestHeader('Content-Type', PHOTO_CONTENT_TYPE)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError('INTERNAL', xhr.status, 'The photo did not upload. Try again.'))
    xhr.onerror = () => reject(new ApiError('OFFLINE', 0, OFFLINE_MESSAGE))
    xhr.ontimeout = () => reject(new ApiError('OFFLINE', 0, OFFLINE_MESSAGE))

    xhr.send(blob)
  })

  onProgress?.(1)
  return { photoPath, bytes: blob.size }
}
