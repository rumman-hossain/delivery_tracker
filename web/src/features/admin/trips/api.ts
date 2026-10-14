import { BASE, apiErrorFrom, authedFetch, idToken } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

/** Hands an assigned trip to a different driver. */
export const reassignTrip = (tripId: string, driverUid: string) =>
  authedFetch(`/admin/trips/${tripId}/driver`, s.zEditedTrip, {
    method: 'PATCH',
    body: { driverUid },
  })

export type TripFilters = { driver?: string; date?: string; status?: s.TripStatus }

export const listTrips = (f: TripFilters = {}) => {
  const q = new URLSearchParams()
  if (f.driver) q.set('driver', f.driver)
  if (f.date) q.set('date', f.date)
  if (f.status) q.set('status', f.status)
  const qs = q.toString()
  return authedFetch(`/admin/trips${qs ? `?${qs}` : ''}`, s.zListTrips)
}

export const getTrip = (id: string) => authedFetch(`/admin/trips/${id}`, s.zGetTrip)

/** Appends a correction. */
export const createCorrection = (tripId: string, body: z.infer<typeof s.zCorrectionReq>) =>
  authedFetch(`/admin/trips/${tripId}/corrections`, s.zCreatedEvent, { method: 'POST', body })

export const assignTrip = (body: z.infer<typeof s.zAssignTripReq>) =>
  authedFetch('/admin/trips', s.zCreatedTrip, { method: 'POST', body })

/** Rewrites the part of a trip the driver has not walked yet. */
export const editTripStops = (tripId: string, body: z.infer<typeof s.zEditTripStopsReq>) =>
  authedFetch(`/admin/trips/${tripId}/stops`, s.zEditedTrip, { method: 'PATCH', body })

/** The report's parameters. */
export type ReportFilters = { from: string; to: string; driver?: string }

export const reportCsvUrl = (f: ReportFilters) => {
  const q = new URLSearchParams({ from: f.from, to: f.to })
  if (f.driver) q.set('driver', f.driver)
  return `${BASE}/admin/reports/trips.csv?${q.toString()}`
}

/** The CSV endpoint needs the bearer token, so it is fetched and handed to the browser. */
export async function downloadReportCsv(f: ReportFilters) {
  const res = await fetch(reportCsvUrl(f), {
    headers: { Authorization: `Bearer ${await idToken()}` },
  })
  if (!res.ok) {
    let payload: unknown = null
    try {
      payload = JSON.parse(await res.text())
    } catch {
    }
    throw apiErrorFrom(res.status, payload)
  }
  return res.blob()
}
