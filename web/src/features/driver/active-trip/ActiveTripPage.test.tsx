import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActiveTripPage } from '@/features/driver/active-trip/ActiveTripPage'
import type { NextStop, Trip } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))
vi.mock('@/lib/firebase/liveTrip', () => ({ useLiveTripWatch: vi.fn() }))
vi.mock('@/features/driver/active-trip/ReachedFlow', () => ({ ReachedFlow: () => null }))
vi.mock('@/features/driver/active-trip/PermissionsBanner', () => ({ PermissionsBanner: () => null }))

const { useMyTrips, useMyTrip, useNextStop } = vi.hoisted(() => ({
  useMyTrips: vi.fn(),
  useMyTrip: vi.fn(),
  useNextStop: vi.fn(),
}))
vi.mock('@/features/driver/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/driver/hooks')>()),
  useMyTrips,
  useMyTrip,
  useNextStop,
  useStartTrip: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCompleteTrip: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

const depot = { placeId: 'w1', name: 'Main Base', lat: 35.8, lng: 139.75 }

const TRIP: Trip = {
  id: 't1',
  routeId: 'r1',
  driverUid: 'd1',
  driverName: 'Sato',
  assignedDate: '2026-09-22',
  status: 'in_progress',
  currentStopSeq: 1,
  createdAt: '2026-09-22T00:00:00Z',
  routeVersion: 1,
  startedAt: '2026-09-22T00:30:00Z',
  routeSnapshot: {
    start: depot,
    end: depot,
    stops: [{ seq: 1, type: 'shop', shopId: 's1', shopName: 'Sugamo' }],
  },
}

const NEXT: NextStop = { done: false, seq: 1, type: 'shop', shopName: 'Sugamo' }

function renderPage(next: NextStop, trip: Trip = TRIP) {
  useMyTrips.mockReturnValue({ data: [trip], isPending: false, error: null, refetch: vi.fn() })
  useMyTrip.mockReturnValue({ data: undefined, isPending: false, error: null, refetch: vi.fn() })
  useNextStop.mockReturnValue({ data: next, isPending: false, error: null, refetch: vi.fn() })

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/driver/trips/t1']}>
        <Routes>
          <Route path="/driver/trips/:id" element={<ActiveTripPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const note = {
  reason: 'Sugamo cancelled, go to Komagome',
  at: '2026-09-22T01:20:00Z',
  byRole: 'admin' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
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

describe('ActiveTripPage', () => {
  it('shows the admin’s reason when the route changed', () => {
    renderPage({ ...NEXT, note })

    expect(screen.getByText('Your route was changed')).toBeInTheDocument()
    expect(screen.getByText(note.reason)).toBeInTheDocument()
  })

  it('says nothing when the route has not changed', () => {
    renderPage(NEXT)
    expect(screen.queryByText('Your route was changed')).not.toBeInTheDocument()
  })

  it('shows it on a trip the driver has not started', () => {
    const assigned: Trip = { ...TRIP, status: 'assigned', startedAt: undefined }
    renderPage({ ...NEXT, note }, assigned)

    expect(screen.getByText(note.reason)).toBeInTheDocument()
  })

  it('shows it once every stop is recorded', () => {
    renderPage({ done: true, note })
    expect(screen.getByText(note.reason)).toBeInTheDocument()
  })
})

describe('a finished trip', () => {
  it('is fetched when it is not among the open trips', () => {
    const finished: Trip = { ...TRIP, status: 'completed', completedAt: '2026-09-22T03:00:00Z' }

    useMyTrips.mockReturnValue({ data: [], isPending: false, error: null, refetch: vi.fn() })
    useMyTrip.mockReturnValue({ data: finished, isPending: false, error: null, refetch: vi.fn() })
    useNextStop.mockReturnValue({ data: { done: true }, isPending: false, error: null, refetch: vi.fn() })

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/driver/trips/t1']}>
          <Routes>
            <Route path="/driver/trips/:id" element={<ActiveTripPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Sugamo')).toBeInTheDocument()
    expect(useMyTrip).toHaveBeenCalledWith('t1', true)
  })

  it('does not fetch one it already holds', () => {
    renderPage(NEXT)
    expect(useMyTrip).toHaveBeenCalledWith('t1', false)
  })
})
