import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CorrectionSheet } from '@/features/admin/trips/CorrectionSheet'
import type { EffectiveEvent } from '@/lib/events'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const createCorrection = vi.hoisted(() => vi.fn())
vi.mock('@/features/admin/trips/api', () => ({ createCorrection }))

const EVENT: EffectiveEvent = {
  id: 'ev-7',
  type: 'REACHED',
  seq: 2,
  serverTime: '2026-09-22T01:23:45.000Z',
  distanceM: 412,
  matchStatus: 'suspect',
  deliveryStatus: 'delivered',
  corrections: [],
}

function renderSheet(event: EffectiveEvent = EVENT) {
  const onOpenChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CorrectionSheet
        tripId="trip-1"
        event={event}
        stopName="Lawson Nakano"
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const save = () => screen.getByRole('button', { name: 'Save correction' })

beforeEach(() => {
  vi.clearAllMocks()
  createCorrection.mockResolvedValue({ eventId: 'corr-1' })
})

describe('CorrectionSheet', () => {
  it('sends only the field that actually changed', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('radio', { name: 'At the shop' }))
    await user.type(screen.getByLabelText('Reason'), 'Shop pin was wrong')
    await user.click(save())

    await waitFor(() => expect(createCorrection).toHaveBeenCalledTimes(1))
    const [tripId, body] = createCorrection.mock.calls[0]

    expect(tripId).toBe('trip-1')
    expect(body.targetEventId).toBe('ev-7')
    expect(body.reason).toBe('Shop pin was wrong')
    expect(body.changes).toEqual({ matchStatus: 'matched' })
    expect(body.changes).not.toHaveProperty('deliveryStatus')
    expect(body.changes).not.toHaveProperty('distanceM')
  })

  it('never sends the fields that order the timeline', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('radio', { name: 'Not delivered' }))
    await user.type(screen.getByLabelText('Reason'), 'Nobody was there')
    await user.click(save())

    await waitFor(() => expect(createCorrection).toHaveBeenCalledTimes(1))
    const { changes } = createCorrection.mock.calls[0][1]
    expect(changes).not.toHaveProperty('serverTime')
    expect(changes).not.toHaveProperty('seq')
    expect(changes).not.toHaveProperty('photoPath')
  })

  it('refuses a correction with no reason', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('radio', { name: 'At the shop' }))
    await user.click(save())

    expect(await screen.findByText('Say why this is being corrected')).toBeInTheDocument()
    expect(createCorrection).not.toHaveBeenCalled()
  })

  it('refuses a correction that changes nothing', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.type(screen.getByLabelText('Reason'), 'Looked at it again')
    await user.click(save())

    expect(await screen.findByText('Change a value before saving.')).toBeInTheDocument()
    expect(createCorrection).not.toHaveBeenCalled()
  })

  it('clears a distance rather than sending zero when the box is emptied', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.clear(screen.getByLabelText('Distance'))
    await user.type(screen.getByLabelText('Reason'), 'Recorded at a home stop, not a shop')
    await user.click(save())

    await waitFor(() => expect(createCorrection).toHaveBeenCalledTimes(1))
    expect(createCorrection.mock.calls[0][1].changes).toEqual({ distanceM: null })
  })

  it('opens on the values as they currently stand', () => {
    renderSheet()
    expect(screen.getByLabelText('Distance')).toHaveValue('412')
    expect(screen.getByRole('radio', { name: 'Away' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Delivered' })).toHaveAttribute('aria-checked', 'true')
  })
})
