import { authedFetch } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

export const myTrips = () => authedFetch('/me/trips', s.zListTrips).then((r) => r.trips)

/** The driver's own finished trips, newest first. */
export const myHistory = (limit: number) =>
  authedFetch(`/me/trips/history?limit=${limit}`, s.zListTrips)

/** One of the driver's own trips. */
export const myTrip = (id: string) =>
  authedFetch(`/me/trips/${id}`, s.zEditedTrip).then((r) => r.trip)

export const startTrip = (id: string, body: z.infer<typeof s.zBaseCapture>) =>
  authedFetch(`/me/trips/${id}/start`, s.zStartResp, { method: 'POST', body })

export const getNextStop = (id: string) => authedFetch(`/me/trips/${id}/next`, s.zNextStop)

export const getPhotoUploadURL = (id: string, seq: number) =>
  authedFetch(`/me/trips/${id}/photo-url`, s.zPhotoURLResp, {
    method: 'POST',
    body: { seq, contentType: 'image/jpeg' },
  })

export const postReached = (id: string, body: s.ReachedReq, idempotencyKey: string) =>
  authedFetch(`/me/trips/${id}/reached`, s.zReachedResp, {
    method: 'POST',
    body,
    idempotencyKey,
  })

export const completeTrip = (id: string, body: z.infer<typeof s.zBaseCapture>) =>
  authedFetch(`/me/trips/${id}/complete`, s.zCompleteResp, { method: 'POST', body })
