import { QueryClientProvider } from '@tanstack/react-query'
import { Component, type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from 'sonner'

import { Button } from '@/components/ui/button'
import { queryClient } from '@/lib/query/queryClient'

/** The root layout: the query cache, the toaster, and a boundary around everything that renders below it. */
export function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <Toaster
        position="top-center"
        richColors
        toastOptions={{ className: 'text-subhead' }}
        offset="calc(env(safe-area-inset-top) + 8px)"
      />
    </QueryClientProvider>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('unhandled render error', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center bg-paper px-6 text-center">
        <div className="max-w-[34ch]">
          <h1 className="text-title font-bold text-ink">The app hit a problem</h1>
          <p className="mt-2 text-subhead leading-snug text-ink-2">
            Nothing you recorded is lost — every tap is saved on the server as it happens.
          </p>
          <Button size="md" className="mt-6" onClick={() => window.location.reload()}>
            Reload the app
          </Button>
        </div>
      </div>
    )
  }
}
