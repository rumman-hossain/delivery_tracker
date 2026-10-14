import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UserEditSheet } from '@/features/admin/users/UserEditSheet'
import type { User } from '@/lib/schemas'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))
const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn() }))
vi.mock('@/features/admin/users/api', () => ({
  updateUser,
  userPhotoPath: (u: string) => `/admin/users/${u}/photo`,
}))
vi.mock('@/lib/api/client', () => ({ fetchPhoto: vi.fn() }))
vi.mock('@/lib/photo', () => ({ uploadUserPhoto: vi.fn() }))
vi.mock('@/components/photo/CameraCapture', () => ({ CameraCapture: () => <div>viewfinder</div> }))

const USER: User = {
  uid: 'd1', role: 'driver', name: 'Sato', email: 's@e.com', phone: '090-1234-5678',
  photoPath: 'users/d1/photo.jpg', active: true, createdAt: '2026-09-01T00:00:00Z',
}

describe('UserEditSheet', () => {
  it('does not close when asking to replace the photo', async () => {
    const onOpenChange = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <UserEditSheet user={USER} open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Take a new one' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('viewfinder')).toBeInTheDocument()
  })

  it('saves the name and phone together', async () => {
    const onOpenChange = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <UserEditSheet user={{ ...USER, phone: '' }} open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Phone'), '090-9999-0000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1))
    expect(updateUser.mock.calls[0][1]).toMatchObject({ name: 'Sato', phone: '090-9999-0000' })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('refuses a number nobody could ring', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <UserEditSheet user={{ ...USER, phone: '' }} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Phone'), '090-12')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/too short to be a phone number/i)).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })
})
