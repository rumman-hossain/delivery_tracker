import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Field, Input, Segmented, SwitchRow } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useCreateShop, useUpdateShop } from '@/features/admin/shops/hooks'
import { ran } from '@/lib/query/mutations'
import { Card, SectionTitle } from '@/components/ui/list'
import type { Shop } from '@/lib/schemas'

const KIND_OPTIONS: { value: 'shop' | 'warehouse' | 'home'; label: string }[] = [
  { value: 'shop', label: 'Shop' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'home', label: 'Home' },
]

const coord = (min: number, max: number, message: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v?.trim() || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), {
      message,
    })

const schema = z
  .object({
    kind: z.enum(['shop', 'warehouse', 'home']),
    name: z.string().min(1, 'Give the place a name'),
    lat: coord(-90, 90, 'Latitude runs from -90 to 90'),
    lng: coord(-180, 180, 'Longitude runs from -180 to 180'),
  address: z.string().optional(),
    radiusM: z
      .string()
      .optional()
      .refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 1000), {
        message: 'Use a whole number between 10 and 1000, or leave it blank',
      }),
    active: z.boolean(),
  })
  .refine((v) => !!v.lat?.trim() === !!v.lng?.trim(), {
    message: 'Give both a latitude and a longitude, or neither',
    path: ['lng'],
  })
  .refine((v) => v.kind === 'home' || (!!v.lat?.trim() && !!v.lng?.trim()), {
    message: 'A shop or warehouse needs a position',
    path: ['lat'],
  })
type Values = z.input<typeof schema>

export function ShopFormSheet({
  open,
  onOpenChange,
  shop,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  shop?: Shop
}) {
  const create = useCreateShop()
  const update = useUpdateShop()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'shop', name: '', lat: '', lng: '', address: '', radiusM: '', active: true },
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      shop
        ? {
            kind: shop.kind ?? 'shop',
            name: shop.name,
            lat: shop.lat === null ? '' : String(shop.lat),
            lng: shop.lng === null ? '' : String(shop.lng),
            address: shop.address ?? '',
            radiusM: shop.radiusM === null ? '' : String(shop.radiusM),
            active: shop.active,
          }
        : { kind: 'shop', name: '', lat: '', lng: '', address: '', radiusM: '', active: true },
    )
  }, [open, shop, form])

  const onSubmit = form.handleSubmit(async (raw) => {
    const v = schema.parse(raw)
    const body = {
      kind: v.kind,
      name: v.name,
      lat: v.lat?.trim() ? Number(v.lat) : null,
      lng: v.lng?.trim() ? Number(v.lng) : null,
      address: v.address?.trim() ?? '',
      radiusM: v.radiusM ? Number(v.radiusM) : null,
      active: v.active,
    }
    const ok = await ran(() =>
      shop ? update.mutateAsync({ id: shop.id, body }) : create.mutateAsync(body),
    )
    if (ok) onOpenChange(false)
  })

  const pending = create.isPending || update.isPending
  const e = form.formState.errors

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={shop ? 'Edit place' : 'Add place'}
      description="A driver's capture is matched against this location."
      footer={
        <Button size="lg" onClick={onSubmit} disabled={pending}>
          {pending ? 'Saving…' : shop ? 'Save place' : 'Add place'}
        </Button>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <section className="mb-6">
          <SectionTitle as="h3">What kind of place</SectionTitle>
          <Segmented
            name="Kind"
            options={KIND_OPTIONS}
            value={form.watch('kind')}
            onChange={(v) => form.setValue('kind', v, { shouldDirty: true })}
          />
          <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">
            Both are visited the same way. A route can start at either.
          </p>
        </section>

        <Card className="mb-6">
          <Field label="Name" htmlFor="shop-name" error={e.name?.message}>
            <Input id="shop-name" placeholder="Corner Market North" {...form.register('name')} />
          </Field>
          <Field label="Address" htmlFor="shop-address" error={e.address?.message}>
            <Input id="shop-address" placeholder="Optional" {...form.register('address')} />
          </Field>
        </Card>

        <Card className="mb-6">
          <Field label="Latitude" htmlFor="shop-lat" error={e.lat?.message}>
            <Input
              id="shop-lat"
              inputMode="decimal"
              placeholder="51.5072"
              className="tnum"
              {...form.register('lat')}
            />
          </Field>
          <Field label="Longitude" htmlFor="shop-lng" error={e.lng?.message}>
            <Input
              id="shop-lng"
              inputMode="decimal"
              placeholder="-0.1276"
              className="tnum"
              {...form.register('lng')}
            />
          </Field>
        </Card>

        <Card className="mb-6">
          <Field
            label="Radius"
            htmlFor="shop-radius"
            error={e.radiusM?.message}
            hint="Leave blank to use the radius in Settings."
          >
            <Input
              id="shop-radius"
              inputMode="numeric"
              placeholder="default"
              className="tnum"
              {...form.register('radiusM')}
            />
          </Field>
          <SwitchRow
            label="Active"
            hint="An inactive place cannot be added to a route."
            checked={form.watch('active')}
            onCheckedChange={(v) => form.setValue('active', v, { shouldDirty: true })}
          />
        </Card>
      </form>
    </Sheet>
  )
}
