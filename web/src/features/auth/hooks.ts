import * as api from '@/features/auth/api'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/query/queryKeys'

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.getMe })
