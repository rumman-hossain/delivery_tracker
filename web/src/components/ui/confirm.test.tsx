import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from '@/components/ui/confirm'

function renderDialog(onConfirm: () => void | Promise<void>) {
  const onOpenChange = vi.fn()
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Start this trip?"
      confirmLabel="Start trip"
      onConfirm={onConfirm}
    />,
  )
  return { onOpenChange }
}

const confirm = () => screen.getByRole('button', { name: 'Start trip' })

describe('ConfirmDialog', () => {
  it('runs a synchronous confirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderDialog(onConfirm)

    await user.click(confirm())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not let a rejected async confirm escape as an unhandled rejection', async () => {
    const user = userEvent.setup()
    const unhandled = vi.fn()
    window.addEventListener('unhandledrejection', unhandled)

    const onConfirm = vi.fn().mockRejectedValue(new Error('DRIVER_BUSY'))
    renderDialog(onConfirm)

    await user.click(confirm())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))

    expect(unhandled).not.toHaveBeenCalled()
    window.removeEventListener('unhandledrejection', unhandled)
  })

  it('still awaits a confirm that succeeds', async () => {
    const user = userEvent.setup()
    const order: string[] = []
    const onConfirm = vi.fn(async () => {
      await Promise.resolve()
      order.push('confirmed')
    })
    renderDialog(onConfirm)

    await user.click(confirm())
    await waitFor(() => expect(order).toEqual(['confirmed']))
  })
})
