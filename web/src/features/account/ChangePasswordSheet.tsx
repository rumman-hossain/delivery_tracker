import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { Card } from '@/components/ui/list'
import { changeOwnPassword, PasswordChangeError } from '@/lib/password'

const MIN_LENGTH = 8

export function ChangePasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setConfirm('')
    setSubmitted(false)
    setFailure(null)
  }, [open])

  const errors = {
    current: current === '' ? 'Enter your current password' : undefined,
    next:
      next.length < MIN_LENGTH ? `At least ${MIN_LENGTH} characters` : undefined,
    confirm: confirm !== next ? 'The two passwords do not match' : undefined,
  }
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined)
  const ready = !errors.current && !errors.next && !errors.confirm

  async function save() {
    setSubmitted(true)
    setFailure(null)
    if (!ready) return

    setPending(true)
    try {
      await changeOwnPassword(current, next)
      toast.success('Password changed')
      onOpenChange(false)
    } catch (error) {
      setFailure(
        error instanceof PasswordChangeError ? error.message : 'Could not change your password.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Change your password"
      description="You'll stay signed in on this device."
      footer={
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? 'Changing…' : 'Change password'}
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        noValidate
      >
        <Card className="mb-6">
          <Field label="Current" htmlFor="cp-current" error={show('current')}>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        </Card>

        <Card className="mb-4">
          <Field label="New" htmlFor="cp-next" error={show('next')}>
            <Input
              id="cp-next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Repeat" htmlFor="cp-confirm" error={show('confirm')}>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </Card>

        {failure ? (
          <p role="alert" className="mb-4 px-1 text-callout text-failed">
            {failure}
          </p>
        ) : null}
      </form>
    </Sheet>
  )
}
