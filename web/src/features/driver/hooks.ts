import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/driver/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/query/queryKeys'

export const useMyTrips = () => useQuery({ queryKey: qk.myTrips, queryFn: api.myTrips })

/** A page of the driver's own finished trips. */
export const useMyHistory = (limit: number) =>
  useQuery({
    queryKey: qk.myHistory(limit),
    queryFn: () => api.myHistory(limit),
    placeholderData: (previous) => previous,
  })

/** One of the driver's own trips, fetched only when it is not already in hand. */
export const useMyTrip = (id: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: qk.myTrip(id!), queryFn: () => api.myTrip(id!), enabled: !!id && enabled })

export const useNextStop = (id: string | undefined, live = true) =>
  useQuery({
    queryKey: qk.nextStop(id!),
    queryFn: () => api.getNextStop(id!),
    enabled: !!id,
    refetchInterval: live ? 30_000 : false,
    refetchIntervalInBackground: false,
  })

export function useStartTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof api.startTrip>[1] }) =>
      api.startTrip(v.id, v.body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.myTrips })
      qc.invalidateQueries({ queryKey: qk.nextStop(v.id) })
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] })
    },
    onError: toastError,
  })
}

export function useCompleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof api.completeTrip>[1] }) =>
      api.completeTrip(v.id, v.body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.myTrips })
      qc.invalidateQueries({ queryKey: qk.nextStop(v.id) })
      qc.invalidateQueries({ queryKey: ['me', 'history'] })
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] })
    },
    onError: toastError,
  })
}
