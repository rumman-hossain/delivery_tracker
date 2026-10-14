import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

import { env } from '@/config/env'

export const TIMEZONE = env.VITE_TIMEZONE

export function formatLocal(iso: string, pattern = 'yyyy-MM-dd HH:mm:ss'): string {
  return formatInTimeZone(new Date(iso), TIMEZONE, pattern)
}

export function formatLocalTime(iso: string): string {
  return formatLocal(iso, 'HH:mm:ss')
}

export function formatLocalDate(iso: string): string {
  return formatLocal(iso, 'yyyy-MM-dd')
}

/** The gap between two events, as a driver would say it. */
export function formatDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return formatDurationMs(ms)
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  const negative = ms < 0
  const total = Math.floor(Math.abs(ms) / 1000)

  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  const out = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
  return negative ? `-${out}` : out
}

/** Distances are only ever shown for shop stops; a home stop has none. */
export function formatDistance(distanceM: number | null | undefined): string {
  if (distanceM === null || distanceM === undefined) return '—'
  if (distanceM < 1000) return `${Math.round(distanceM)} m`
  return `${(distanceM / 1000).toFixed(2)} km`
}

export function formatAccuracy(accuracyM: number | null | undefined): string {
  if (accuracyM === null || accuracyM === undefined) return '—'
  return `±${Math.round(accuracyM)} m`
}

/** A blank per-shop radius means the shop follows the global setting. */
export function formatRadius(radiusM: number | null | undefined): string {
  return radiusM === null || radiusM === undefined ? 'default' : `${radiusM} m`
}

/** Client clocks drift. */
export const SKEW_WARN_MS = 120_000

export function isSkewNotable(timeSkewMs: number | null | undefined): boolean {
  return timeSkewMs !== null && timeSkewMs !== undefined && Math.abs(timeSkewMs) >= SKEW_WARN_MS
}

/** Today in the configured timezone, as the YYYY-MM-DD string the API expects for assignedDate. */
export function todayJst(now: Date = new Date()): string {
  return formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd')
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** An assignedDate as a driver would read it. */
export function formatTripDate(date: string, now: Date = new Date()): string {
  const today = todayJst(now)
  if (date === today) return 'Today'
  if (date === shiftDay(today, 1)) return 'Tomorrow'
  if (date === shiftDay(today, -1)) return 'Yesterday'

  const pattern = date.slice(0, 4) === today.slice(0, 4) ? 'EEE d MMM' : 'd MMM yyyy'
  return formatInTimeZone(fromZonedTime(`${date}T00:00:00`, TIMEZONE), TIMEZONE, pattern)
}
