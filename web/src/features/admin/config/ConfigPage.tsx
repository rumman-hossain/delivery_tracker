import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { KeyRound } from 'lucide-react'

import { SignOutRow } from '@/components/layout/AppShell'
import { ChangePasswordSheet } from '@/features/account/ChangePasswordSheet'
import { DataState } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ListSection } from '@/components/ui/list'
import { useConfig, useUpdateConfig } from '@/features/admin/config/hooks'
import { ran } from '@/lib/query/mutations'

const schema = z.object({
  matchRadiusM: z.coerce
    .number()
    .int('Use a whole number of metres')
    .min(10, 'At least 10 m')
    .max(1000, 'At most 1000 m'),
})
type Values = z.input<typeof schema>

/** The one global setting: how close counts as "at the shop". */
export function ConfigPage() {
  const config = useConfig()
  const update = useUpdateConfig()
  const [changingPassword, setChangingPassword] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { matchRadiusM: '' },
  })

  useEffect(() => {
    if (config.data) form.reset({ matchRadiusM: String(config.data.matchRadiusM) })
  }, [config.data, form])

  const onSubmit = form.handleSubmit(async (raw) => {
    await ran(() => update.mutateAsync(schema.parse(raw)))
  })

  return (
    <Screen title="Settings">
      <DataState query={config} skeleton={null}>
        {() => (
          <form onSubmit={onSubmit} noValidate>
            <ListSection
              title="Location matching"
              footer="A stop recorded inside this distance of the shop counts as matched; anything further is flagged for review. Shops with their own radius ignore this. Trips already assigned keep the radius they were created with."
            >
              <Field
                label="Radius"
                htmlFor="radius"
                error={form.formState.errors.matchRadiusM?.message}
              >
                <div className="flex items-center gap-1">
                  <Input
                    id="radius"
                    inputMode="numeric"
                    className="tnum text-right"
                    {...form.register('matchRadiusM')}
                  />
                  <span className="shrink-0 text-body text-ink-3">m</span>
                </div>
              </Field>
            </ListSection>

            <Button type="submit" size="lg" disabled={!form.formState.isDirty} pending={update.isPending} pendingLabel="Saving…">
              Save settings
            </Button>
          </form>
        )}
      </DataState>

      <ListSection className="mt-8" title="Your account">
        <button
          type="button"
          onClick={() => setChangingPassword(true)}
          className="flex min-h-row w-full items-center gap-3 border-b border-hairline px-4 text-body text-ink active:bg-paper"
        >
          <KeyRound size={18} className="shrink-0 text-ink-3" />
          <span>Change password</span>
        </button>
        <SignOutRow />
      </ListSection>

      <ChangePasswordSheet open={changingPassword} onOpenChange={setChangingPassword} />
    </Screen>
  )
}
