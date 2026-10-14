import type { TripFilters } from '@/features/admin/trips/api'

/** Every cache key in the app comes from here. */
export const qk = {
  shops: ['shops'] as const,
  config: ['config'] as const,
  routes: ['routes'] as const,
  route: (id: string) => ['routes', id] as const,
  users: (role?: string) => ['users', role ?? 'all'] as const,
  adminTrips: (f: TripFilters) => ['admin', 'trips', f] as const,
  trip: (id: string) => ['trip', id] as const,
  me: ['me'] as const,
  myTrips: ['me', 'trips'] as const,
  nextStop: (id: string) => ['me', 'trips', id, 'next'] as const,
  myHistory: (limit: number) => ['me', 'history', limit] as const,
  myTrip: (id: string) => ['me', 'trip', id] as const,
  photo: (path: string) => ['photo', path] as const,
}
