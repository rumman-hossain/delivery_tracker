import type { z } from 'zod'
import { auth } from '@/lib/firebase/firebase'
import { env } from '@/config/env'
import { ApiError, OFFLINE_MESSAGE } from '@/lib/errors'

export const BASE = env.VITE_API_BASE_URL

const IDEMPOTENCY_HEADER = 'Idempotency-Key'

type FetchOpts = {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

export async function idToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new ApiError('UNAUTHENTICATED', 401)
  return user.getIdToken()
}

export function apiErrorFrom(status: number, payload: unknown): ApiError {
  const envelope = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error
  const code = typeof envelope?.code === 'string' ? envelope.code : 'INTERNAL'
  const message = typeof envelope?.message === 'string' ? envelope.message : undefined
  return new ApiError(code, status, message)
}

export async function authedFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  opts: FetchOpts = {},
): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal } = opts

  const headers: Record<string, string> = { Authorization: `Bearer ${await idToken()}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError('OFFLINE', 0, OFFLINE_MESSAGE)
  }

  const text = await res.text()
  const payload: unknown = text ? JSON.parse(text) : null

  if (!res.ok) throw apiErrorFrom(res.status, payload)

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    console.error(`contract mismatch on ${method} ${path}`, parsed.error.issues, payload)
    throw new ApiError('INTERNAL', res.status)
  }
  return parsed.data
}

/** Fetches a proof photo's bytes. */
export async function fetchPhoto(path: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${await idToken()}` },
      signal,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError('OFFLINE', 0, OFFLINE_MESSAGE)
  }

  if (!res.ok) {
    const text = await res.text()
    throw apiErrorFrom(res.status, text ? JSON.parse(text) : null)
  }
  return res.blob()
}
