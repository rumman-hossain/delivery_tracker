import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResetPasswordSheet } from '@/features/admin/users/ResetPasswordSheet'
import type { User } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const resetUserPassword = vi.hoisted(() => vi.fn())
vi.mock('@/features/admin/users/api', () => ({ resetUserPassword }))

const DRIVER: User = {
  uid: 'driver-7',
  role: 'driver',
  name: 'Sato Kenji',
  email: 'sato@example.com',
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  createdBy: 'admin-1',
}

function renderSheet(user: User | null = DRIVER) {
  const onOpenChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ResetPasswordSheet user={user} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const save = () => screen.getByRole('button', { name: 'Set this password' })

beforeEach(() => {
  vi.clearAllMocks()
  resetUserPassword.mockResolvedValue({ ok: true })
})

describe('ResetPasswordSheet', () => {
  it('sends the new password for the account it was opened on', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet()

    await user.type(screen.getByLabelText('New password'), 'brandnew1')
    await user.click(save())

    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('driver-7', 'brandnew1'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('refuses a password the server would reject anyway', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(save())

    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument()
    expect(resetUserPassword).not.toHaveBeenCalled()
  })

  it('shows the password being set rather than masking it', () => {
    renderSheet()
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
  })

  it('says that it signs the person out everywhere', () => {
    renderSheet()
    expect(screen.getByText(/signs Sato Kenji out on every device/i)).toBeInTheDocument()
  })
})
