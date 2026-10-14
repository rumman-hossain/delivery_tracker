import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChangePasswordSheet } from '@/features/account/ChangePasswordSheet'

vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const changeOwnPassword = vi.hoisted(() => vi.fn())
vi.mock('@/lib/password', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/password')>()),
  changeOwnPassword,
}))

const save = () => screen.getByRole('button', { name: 'Change password' })

beforeEach(() => {
  vi.clearAllMocks()
  changeOwnPassword.mockResolvedValue(undefined)
})

describe('ChangePasswordSheet', () => {
  it('will not change anything without the current password', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordSheet open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('New'), 'brandnew1')
    await user.type(screen.getByLabelText('Repeat'), 'brandnew1')
    await user.click(save())

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(changeOwnPassword).not.toHaveBeenCalled()
  })

  it('refuses a new password that does not match its repeat', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordSheet open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('Current'), 'oldpass1')
    await user.type(screen.getByLabelText('New'), 'brandnew1')
    await user.type(screen.getByLabelText('Repeat'), 'brandnew2')
    await user.click(save())

    expect(await screen.findByText('The two passwords do not match')).toBeInTheDocument()
    expect(changeOwnPassword).not.toHaveBeenCalled()
  })

  it('refuses a password shorter than the server would accept', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordSheet open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('Current'), 'oldpass1')
    await user.type(screen.getByLabelText('New'), 'short')
    await user.type(screen.getByLabelText('Repeat'), 'short')
    await user.click(save())

    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument()
    expect(changeOwnPassword).not.toHaveBeenCalled()
  })

  it('sends the current password along with the new one', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ChangePasswordSheet open onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Current'), 'oldpass1')
    await user.type(screen.getByLabelText('New'), 'brandnew1')
    await user.type(screen.getByLabelText('Repeat'), 'brandnew1')
    await user.click(save())

    await waitFor(() => expect(changeOwnPassword).toHaveBeenCalledWith('oldpass1', 'brandnew1'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows a wrong current password beside the form, not as a toast', async () => {
    const user = userEvent.setup()
    const { PasswordChangeError } = await import('@/lib/password')
    changeOwnPassword.mockRejectedValueOnce(
      new PasswordChangeError('auth/invalid-credential', 'That is not your current password.'),
    )
    render(<ChangePasswordSheet open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('Current'), 'wrongpass')
    await user.type(screen.getByLabelText('New'), 'brandnew1')
    await user.type(screen.getByLabelText('Repeat'), 'brandnew1')
    await user.click(save())

    expect(await screen.findByText('That is not your current password.')).toBeInTheDocument()
  })
})
