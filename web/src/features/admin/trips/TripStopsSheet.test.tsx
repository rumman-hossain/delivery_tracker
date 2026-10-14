import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TripStopsSheet } from '@/features/admin/trips/TripStopsSheet'
import type { Shop, Trip } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const { editTripStops, listShops } = vi.hoisted(() => ({
  editTripStops: vi.fn(),
  listShops: vi.fn(),
}))
vi.mock('@/features/admin/trips/api', () => ({ editTripStops }))
vi.mock('@/features/admin/shops/api', () => ({ listShops }))

const shop = (id: string, name: string, active = true): Shop => ({
  id,
  name,
  lat: 35.68,
  lng: 139.76,
  radiusM: null,
  active,
  createdAt: '2026-09-01T00:00:00.000Z',
})

const SHOPS = [shop('s1', 'Lawson Nakano'), shop('s2', 'Family Mart Koenji')]

const TRIP: Trip = {
  id: 'trip-1',
  routeId: 'route-1',
  driverUid: 'driver-1',
  driverName: 'Sato',
  assignedDate: '2026-09-22',
  status: 'in_progress',
  currentStopSeq: 1,
  createdAt: '2026-09-22T00:00:00.000Z',
  routeVersion: 0,
  routeSnapshot: {
    start: { placeId: 'w1', name: 'Warehouse', lat: 35.6, lng: 139.7 },
    end: { placeId: 'w1', name: 'Warehouse', lat: 35.6, lng: 139.7 },
    stops: [
      { seq: 1, type: 'shop', shopId: 's1', shopName: 'Lawson Nakano' },
      { seq: 2, type: 'shop', shopId: 's2', shopName: 'Family Mart Koenji' },
    ],
  },
}

function renderSheet(trip: Trip = TRIP) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <TripStopsSheet trip={trip} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )
  return {
    ...view,
    moveTripTo: (next: Partial<Trip>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <TripStopsSheet trip={{ ...trip, ...next }} open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      ),
  }
}

const update = () => screen.getByRole('button', { name: 'Update the route' })

beforeEach(() => {
  vi.clearAllMocks()
  listShops.mockResolvedValue(SHOPS)
  editTripStops.mockResolvedValue({ trip: TRIP })
})

describe('TripStopsSheet', () => {
  it('keeps the admin’s work when the driver moves on, and says so', async () => {
    const user = userEvent.setup()
    const { moveTripTo } = renderSheet()

    await user.type(screen.getByLabelText('Reason'), 'Warehouse closed early')
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1])

    moveTripTo({ currentStopSeq: 2 })

    expect(screen.getByLabelText('Reason')).toHaveValue('Warehouse closed early')
    expect(screen.getByText(/has moved on, or someone else changed this route/)).toBeInTheDocument()
  })

  it('sends the basis the list was composed against, not the one that is true now', async () => {
    const user = userEvent.setup()
    const { moveTripTo } = renderSheet()

    await user.type(screen.getByLabelText('Reason'), 'Warehouse closed early')
    moveTripTo({ currentStopSeq: 2, routeVersion: 3 })
    await user.click(update())

    await waitFor(() => expect(editTripStops).toHaveBeenCalledTimes(1))
    const body = editTripStops.mock.calls[0][1]
    expect(body.fromStopSeq).toBe(1)
    expect(body.routeVersion).toBe(0)
  })

  it('reloads the current stops when the admin asks for them', async () => {
    const user = userEvent.setup()
    const { moveTripTo } = renderSheet()

    await user.type(screen.getByLabelText('Reason'), 'Warehouse closed early')
    moveTripTo({ currentStopSeq: 2, routeVersion: 3 })
    await user.click(screen.getByRole('button', { name: 'Load the current stops' }))

    expect(
      screen.queryByText(/has moved on, or someone else changed this route/),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toHaveValue('')

    await user.type(screen.getByLabelText('Reason'), 'Rest of the round cancelled')
    await user.click(update())

    await waitFor(() => expect(editTripStops).toHaveBeenCalledTimes(1))
    expect(editTripStops.mock.calls[0][1].fromStopSeq).toBe(2)
    expect(editTripStops.mock.calls[0][1].routeVersion).toBe(3)
  })

  it('fails on the row whose place has been retired, not on the whole request', async () => {
    listShops.mockResolvedValue([SHOPS[0], shop('s2', 'Family Mart Koenji', false)])
    const user = userEvent.setup()
    renderSheet()

    await screen.findByRole('option', { name: 'Family Mart Koenji (inactive)' })

    await user.type(screen.getByLabelText('Reason'), 'Reordering the afternoon')
    await user.click(update())

    expect(
      await screen.findByText('This place is no longer active. Remove it or pick another.'),
    ).toBeInTheDocument()
    expect(editTripStops).not.toHaveBeenCalled()
  })

  it('does not call a place retired merely because the list has not arrived', async () => {
    listShops.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderSheet()

    await user.type(screen.getByLabelText('Reason'), 'Reordering the afternoon')
    await user.click(update())

    await waitFor(() => expect(editTripStops).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('This place is no longer active. Remove it or pick another.'),
    ).not.toBeInTheDocument()
  })

  it('will not save at all when the places could not be loaded', async () => {
    listShops.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderSheet()

    expect(await screen.findByText(/list of places could not be loaded/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Reason'), 'Reordering the afternoon')
    expect(update()).toBeDisabled()

    await user.click(update())
    expect(editTripStops).not.toHaveBeenCalled()
  })
})

describe('a trip that finishes while the sheet is open', () => {
  it('says the route can no longer change, and will not save', async () => {
    const { moveTripTo } = renderSheet()
    expect(screen.queryByText(/can no longer change/i)).not.toBeInTheDocument()

    moveTripTo({ status: 'completed' })

    expect(await screen.findByText(/can no longer change/i)).toBeInTheDocument()
    expect(update()).toBeDisabled()
  })

  it('does not offer to reload the stops, which would clear the warning', async () => {
    const { moveTripTo } = renderSheet()
    moveTripTo({ status: 'completed' })

    await screen.findByText(/can no longer change/i)
    expect(screen.queryByRole('button', { name: 'Load the current stops' })).not.toBeInTheDocument()
  })

  it('never sends an edit for a finished trip', async () => {
    const user = userEvent.setup()
    const { moveTripTo } = renderSheet()
    moveTripTo({ status: 'completed' })
    await screen.findByText(/can no longer change/i)

    await user.click(update())
    expect(editTripStops).not.toHaveBeenCalled()
  })
})

describe('a registered home delivery in the stops sheet', () => {
  const homeTrip: Trip = {
    ...TRIP,
    routeSnapshot: {
      ...TRIP.routeSnapshot,
      stops: [
        { seq: 1, type: 'shop', shopId: 's1', shopName: 'Lawson Nakano' },
        { seq: 2, type: 'home', shopId: 'h1', label: 'Tanaka-san, 3F' },
      ],
    },
  }

  const places = [
    ...SHOPS,
    { ...shop('h1', 'Tanaka-san, 3F'), kind: 'home' as const, lat: null, lng: null },
  ]

  it('keeps its place id through a save, rather than becoming a label', async () => {
    listShops.mockResolvedValue(places)
    const user = userEvent.setup()
    renderSheet(homeTrip)

    expect(await screen.findAllByRole('option', { name: 'Tanaka-san, 3F' })).not.toHaveLength(0)

    await user.type(screen.getByLabelText('Reason'), 'Adding an afternoon drop')
    await user.click(update())

    await waitFor(() => expect(editTripStops).toHaveBeenCalledTimes(1))
    const sent = editTripStops.mock.calls[0][1].stops
    expect(sent).toContainEqual({ seq: 2, type: 'shop', shopId: 'h1' })
  })
})
