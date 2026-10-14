import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/admin/routes/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/queryKeys'

export const useRoutes = () => useQuery({ queryKey: qk.routes, queryFn: api.listRoutes })

export const useRoute = (id: string | undefined) =>
  useQuery({ queryKey: qk.route(id!), queryFn: () => api.getRoute(id!), enabled: !!id })

export function useCreateRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createRoute,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.routes })
      toast.success('Route created')
    },
    onError: toastError,
  })
}

export function useUpdateRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof api.updateRoute>[1] }) =>
      api.updateRoute(v.id, v.body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.routes })
      qc.invalidateQueries({ queryKey: qk.route(v.id) })
      toast.success('Route saved')
    },
    onError: toastError,
  })
}
