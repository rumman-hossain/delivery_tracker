import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'

import { CameraCapture } from '@/components/photo/CameraCapture'
import { Button } from '@/components/ui/button'
import { Field, Input, Segmented } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useCreateUser, useUploadUserPhoto } from '@/features/admin/users/hooks'
import { ran } from '@/lib/query/mutations'
import { Card, SectionTitle } from '@/components/ui/list'
import { zPhone } from '@/lib/schemas'

const zCreatable = z.enum(['driver', 'admin'])
type Creatable = z.infer<typeof zCreatable>

const schema = z.object({
  name: z.string().min(1, 'Give them a name'),
  email: z.email('Enter a valid email address'),
  phone: zPhone,
  tempPassword: z.string().min(8, 'At least 8 characters'),
  role: zCreatable,
})
type Values = z.infer<typeof schema>

const ROLE_OPTIONS: { value: Creatable; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'admin', label: 'Admin' },
]

const BLURB: Record<Creatable, string> = {
  driver: 'Runs routes and records stops. Sees only their own trips.',
  admin: 'Manages the drivers they create, and every route and shop.',
}

export function UserFormSheet({
  open,
  role,
  canChooseRole,
  onOpenChange,
}: {
  open: boolean
  role: Creatable
  canChooseRole: boolean
  onOpenChange: (v: boolean) => void
}) {
  const create = useCreateUser()
  const uploadPhoto = useUploadUserPhoto()
  const [shot, setShot] = useState<{ blob: Blob } | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', tempPassword: '', role },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: '', email: '', phone: '', tempPassword: '', role })
      setShot(null)
    }
  }, [open, role, form])

  const chosen = form.watch('role')

  const onSubmit = form.handleSubmit(async (v) => {
    let created: { uid: string } | undefined
    const ok = await ran(async () => {
      created = await create.mutateAsync({
        name: v.name,
        email: v.email,
        phone: v.phone,
        tempPassword: v.tempPassword,
        role: chosen,
      })
    })
    if (!ok) return

    if (shot && created?.uid) {
      try {
        await uploadPhoto.mutateAsync({ uid: created.uid, blob: shot.blob })
      } catch {
        toast.error('The account was created, but the photo did not upload. Add it with Edit on their row.')
      }
    }
    onOpenChange(false)
  })

  const e = form.formState.errors

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={chosen === 'admin' ? 'Add admin' : 'Add driver'}
      description="They sign in with this email and password."
      footer={
        <Button size="lg" onClick={onSubmit} pending={create.isPending} pendingLabel="Adding…">
          {chosen === 'admin' ? 'Add admin' : 'Add driver'}
        </Button>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {canChooseRole ? (
          <section className="mb-6">
            <SectionTitle as="h3">What they can do</SectionTitle>
            <Segmented
              name="Role"
              options={ROLE_OPTIONS}
              value={chosen}
              onChange={(v) => form.setValue('role', v)}
            />
            <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">{BLURB[chosen]}</p>
          </section>
        ) : null}

        <section className="mb-6">
          <SectionTitle as="h3">
            Photo{chosen === 'driver' ? '' : ' (optional)'}
          </SectionTitle>
          <CameraCapture place={form.watch('name') || 'New account'} shot={shot} onShot={setShot} />
          <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">
            So whoever is looking at a trip knows who is running it. Taken here — there is
            no camera roll in this app.
          </p>
        </section>

        <Card className="mb-6">
          <Field label="Name" htmlFor="u-name" error={e.name?.message}>
            <Input id="u-name" placeholder="Sato Kenji" {...form.register('name')} />
          </Field>
          <Field label="Email" htmlFor="u-email" error={e.email?.message}>
            <Input
              id="u-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="them@example.com"
              {...form.register('email')}
            />
          </Field>
          <Field
            label="Phone"
            htmlFor="u-phone"
            error={e.phone?.message}
            hint={
              chosen === 'admin'
                ? 'Your drivers see this number and can call you from the app.'
                : 'So you can reach them on the road, and they can reach you.'
            }
          >
            <Input
              id="u-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="090-1234-5678"
              {...form.register('phone')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="u-pass"
            error={e.tempPassword?.message}
            hint="Pass it to them directly. They can change it themselves once signed in."
          >
            <Input id="u-pass" autoComplete="new-password" {...form.register('tempPassword')} />
          </Field>
        </Card>
      </form>
    </Sheet>
  )
}
