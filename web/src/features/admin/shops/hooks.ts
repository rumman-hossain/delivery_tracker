import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/admin/shops/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/queryKeys'

export const useShops = () => useQuery({ queryKey: qk.shops, queryFn: api.listShops })

export function useCreateShop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createShop,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shops })
      toast.success('Shop added')
    },
    onError: toastError,
  })
}

export function useUpdateShop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof api.updateShop>[1] }) =>
      api.updateShop(v.id, v.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shops })
      toast.success('Shop saved')
    },
    onError: toastError,
  })
}
