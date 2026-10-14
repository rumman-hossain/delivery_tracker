import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/admin/trips/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { TripFilters } from '@/features/admin/trips/api'
import { ApiError } from '@/lib/errors'
import { qk } from '@/lib/query/queryKeys'

/** Returns the whole envelope — `data.trips` plus `truncated`/`limit`. */
export const useAdminTrips = (filters: TripFilters) =>
  useQuery({ queryKey: qk.adminTrips(filters), queryFn: () => api.listTrips(filters) })

export const useTrip = (id: string | undefined) =>
  useQuery({ queryKey: qk.trip(id!), queryFn: () => api.getTrip(id!), enabled: !!id })

/** Appends a correction to a recorded event. */
export function useCreateCorrection(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createCorrection>[1]) =>
      api.createCorrection(tripId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.trip(tripId) })
      toast.success('Correction recorded')
    },
    onError: toastError,
  })
}

/** Hands an assigned trip to a different driver. */
export function useReassignTrip(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (driverUid: string) => api.reassignTrip(tripId, driverUid),
    onSuccess: ({ trip }) => {
      qc.invalidateQueries({ queryKey: qk.trip(tripId) })
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] })
      toast.success(`${trip.driverName} has this trip now.`)
    },
    onError: (error) => {
      toastError(error)
      qc.invalidateQueries({ queryKey: qk.trip(tripId) })
    },
  })
}

export function useEditTripStops(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof api.editTripStops>[1]) => api.editTripStops(tripId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.trip(tripId) })
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] })
      toast.success('Route updated. The driver sees it now.')
    },
    onError: (error) => {
      toastError(error)
      if (error instanceof ApiError && error.code === 'OUT_OF_ORDER') {
        qc.invalidateQueries({ queryKey: qk.trip(tripId) })
      }
    },
  })
}

export function useAssignTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.assignTrip,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] })
      toast.success('Trip assigned')
    },
    onError: toastError,
  })
}
