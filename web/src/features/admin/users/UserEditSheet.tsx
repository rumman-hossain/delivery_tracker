import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { CameraCapture } from '@/components/photo/CameraCapture'
import { ProofPhoto } from '@/components/photo/ProofPhoto'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { userPhotoPath } from '@/features/admin/users/api'
import { toast } from 'sonner'

import { useUpdateUser, useUploadUserPhoto } from '@/features/admin/users/hooks'
import { ran } from '@/lib/query/mutations'
import { Card, SectionTitle } from '@/components/ui/list'
import { zPhone, type User } from '@/lib/schemas'

const schema = z.object({
  name: z.string().min(1, 'A name is needed'),
  phone: zPhone,
})
type Values = z.infer<typeof schema>

export function UserEditSheet({
  user,
  open,
  onOpenChange,
}: {
  user: User | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const update = useUpdateUser()
  const uploadPhoto = useUploadUserPhoto()
  const [shot, setShot] = useState<{ blob: Blob } | null>(null)
  const [replacing, setReplacing] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '' },
  })

  useEffect(() => {
    if (!open || !user) return
    form.reset({ name: user.name, phone: user.phone ?? '' })
    setShot(null)
    setReplacing(!user.photoPath)
  }, [open, user, form])

  const onSubmit = form.handleSubmit(async (v) => {
    if (!user) return

    const changed =
      v.name.trim() !== user.name || v.phone.trim() !== (user.phone ?? '')

    if (changed) {
      const ok = await ran(() =>
        update.mutateAsync({ uid: user.uid, body: { name: v.name.trim(), phone: v.phone.trim() } }),
      )
      if (!ok) return
    }

    if (shot) {
      try {
        await uploadPhoto.mutateAsync({ uid: user.uid, blob: shot.blob })
      } catch {
        toast.error(
          changed
            ? 'Saved, but the photo did not upload. Try the photo again.'
            : 'The photo did not upload. Try again.',
        )
        return
      }
    }
    onOpenChange(false)
  })

  const pending = update.isPending || uploadPhoto.isPending
  const e = form.formState.errors

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Edit ${user.name}` : 'Edit'}
      description="Their sign-in email and role do not change here."
      footer={
        <Button size="lg" onClick={onSubmit} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <section className="mb-6">
          <SectionTitle as="h3">Photo</SectionTitle>
          {replacing || shot ? (
            <CameraCapture place={user?.name ?? ''} shot={shot} onShot={setShot} />
          ) : (
            <div className="flex items-center gap-3 rounded-card bg-surface px-4 py-4">
              {user ? (
                <ProofPhoto
                  path={userPhotoPath(user.uid)}
                  alt={`Photo of ${user.name}`}
                  className="size-14 shrink-0 overflow-hidden rounded-full object-cover"
                  fallback={<span className="block size-full rounded-full bg-paper" />}
                />
              ) : null}
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setReplacing(true)}
              >
                Take a new one
              </Button>
            </div>
          )}
        </section>

        <Card className="mb-6">
          <Field label="Name" htmlFor="e-name" error={e.name?.message}>
            <Input id="e-name" {...form.register('name')} />
          </Field>
          <Field
            label="Phone"
            htmlFor="e-phone"
            error={e.phone?.message}
            hint={
              user?.role === 'driver'
                ? 'So you can reach them on the road.'
                : 'Their drivers see this number and can call it from the app.'
            }
          >
            <Input
              id="e-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="090-1234-5678"
              {...form.register('phone')}
            />
          </Field>
        </Card>
      </form>
    </Sheet>
  )
}
