import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useResetUserPassword } from '@/features/admin/users/hooks'
import { ran } from '@/lib/query/mutations'
import { Card } from '@/components/ui/list'
import type { User } from '@/lib/schemas'

const MIN_LENGTH = 8

export function ResetPasswordSheet({
  user,
  onOpenChange,
}: {
  user: User | null
  onOpenChange: (open: boolean) => void
}) {
  const reset = useResetUserPassword()
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!user) return
    setPassword('')
    setSubmitted(false)
  }, [user])

  const tooShort = password.length < MIN_LENGTH

  async function save() {
    setSubmitted(true)
    if (tooShort || !user) return
    const ok = await ran(() => reset.mutateAsync({ uid: user.uid, newPassword: password }))
    if (ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={!!user}
      onOpenChange={onOpenChange}
      title={`Reset ${user?.name ?? 'password'}`}
      description={user?.email}
      footer={
        <Button size="lg" onClick={save} pending={reset.isPending} pendingLabel="Changing…">
          Set this password
        </Button>
      }
    >
      <Card className="mb-4">
        <Field
          label="New password"
          htmlFor="rp-password"
          error={submitted && tooShort ? `At least ${MIN_LENGTH} characters` : undefined}
          hint="Pass it to them directly. They can change it themselves afterwards."
        >
          <Input
            id="rp-password"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </Card>

      <p className="mb-4 px-1 text-footnote leading-snug text-ink-3">
        This signs {user?.name ?? 'them'} out on every device. They will need the new
        password to get back in.
      </p>
    </Sheet>
  )
}
