import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MyTripsPage } from '@/features/driver/trips/MyTripsPage'
import type { Trip } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const { useMyTrips, useMyHistory } = vi.hoisted(() => ({
  useMyTrips: vi.fn(),
  useMyHistory: vi.fn(),
}))
vi.mock('@/features/driver/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/driver/hooks')>()),
  useMyTrips,
  useMyHistory,
}))

const depot = { placeId: 'w1', name: 'Main Base', lat: 35.8, lng: 139.75 }

const trip = (id: string): Trip => ({
  id,
  routeId: 'r1',
  driverUid: 'd1',
  driverName: 'Sato',
  assignedDate: '2026-09-20',
  status: 'completed',
  currentStopSeq: 2,
  createdAt: '2026-09-20T00:00:00Z',
  routeVersion: 0,
  routeSnapshot: {
    start: depot,
    end: depot,
    stops: [{ seq: 1, type: 'shop', shopId: 's1', shopName: 'Sugamo' }],
  },
})

const draw = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyTripsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const page = (n: number) => Array.from({ length: n }, (_, i) => trip(`t${i}`))

beforeEach(() => {
  useMyTrips.mockReturnValue({ data: [], isPending: false, isError: false })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('the driver history section', () => {
  it('offers the next page while there is more', () => {
    useMyHistory.mockReturnValue({
      data: { trips: page(20), truncated: true, limit: 20 },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })
    draw()
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
  })

  it('keeps a way back when the next page fails', async () => {
    const refetch = vi.fn()
    const { rerender } = draw()

    useMyHistory.mockReturnValue({
      data: { trips: page(20), truncated: true, limit: 20 },
      isFetching: false,
      isError: false,
      refetch,
    })
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MyTripsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getAllByRole('link')).toHaveLength(20)

    useMyHistory.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
      refetch,
    })
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MyTripsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getAllByRole('link')).toHaveLength(20)
    const button = screen.getByRole('button', { name: 'Try again' })
    button.click()
    expect(refetch).toHaveBeenCalled()
  })

  it('says so instead of offering a button that cannot make progress', () => {
    useMyHistory.mockReturnValue({
      data: { trips: page(500), truncated: true, limit: 500 },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })
    draw()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    expect(screen.getByText(/most recent 500 trips/)).toBeInTheDocument()
  })
})
