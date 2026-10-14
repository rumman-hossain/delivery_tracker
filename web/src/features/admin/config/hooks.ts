import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/admin/config/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/queryKeys'

export const useConfig = () => useQuery({ queryKey: qk.config, queryFn: api.getConfig })

export function useUpdateConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.updateConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.config })
      toast.success('Settings saved')
    },
    onError: toastError,
  })
}
