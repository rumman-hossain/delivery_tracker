import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/errors'

/** Retry once, except where a retry is either pointless or unsafe. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})
