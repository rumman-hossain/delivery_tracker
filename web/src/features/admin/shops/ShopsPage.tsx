import { Plus } from 'lucide-react'
import { useState } from 'react'

import { ShopFormSheet } from '@/features/admin/shops/ShopFormSheet'
import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { Pill } from '@/components/trip/StatusPill'
import { Button } from '@/components/ui/button'
import { ListRow, ListSection } from '@/components/ui/list'
import { formatRadius } from '@/lib/format'
import { useShops } from '@/features/admin/shops/hooks'
import type { Shop } from '@/lib/schemas'

const KIND_GROUPS: { kind: 'warehouse' | 'shop' | 'home'; title: string; blurb: string }[] = [
  { kind: 'warehouse', title: 'Warehouses', blurb: 'Where a round is loaded. A route can start here.' },
  { kind: 'shop', title: 'Shops', blurb: 'Where deliveries are made.' },
  {
    kind: 'home',
    title: 'Home deliveries',
    blurb:
      'A customer\u2019s door. A position is optional here \u2014 without one the driver\u2019s GPS is still recorded, it just has nothing to be checked against. A route can call at these, but not start or finish at one.',
  },
]

export function ShopsPage() {
  const shops = useShops()
  const [editing, setEditing] = useState<Shop | undefined>()
  const [open, setOpen] = useState(false)

  const add = () => {
    setEditing(undefined)
    setOpen(true)
  }

  return (
    <Screen
      title="Places"
      subtitle="Warehouses and shops a route can call at, and how close a driver must be."
      trailing={
        <Button variant="plain" size="icon" onClick={add} aria-label="Add place">
          <Plus size={24} strokeWidth={2.4} />
        </Button>
      }
    >
      <DataState
        query={shops}
        empty={
          <Empty
            title="No places yet"
            body="Add the warehouses, shops and home deliveries your drivers call at, then build a route from them."
            action={
              <Button size="md" onClick={add}>
                Add place
              </Button>
            }
          />
        }
      >
        {(list) => (
          <>
            {KIND_GROUPS.map((group) => {
              const inGroup = list.filter((s) => (s.kind ?? 'shop') === group.kind)
              if (inGroup.length === 0) return null
              return (
                <ListSection key={group.kind} title={group.title} footer={group.blurb}>
                  {inGroup.map((shop) => (
                    <ListRow key={shop.id} interactive className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(shop)
                          setOpen(true)
                        }}
                        className="flex min-h-row-lg w-full items-center gap-3 px-4 py-2.5 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium text-ink">{shop.name}</p>
                          <p className="truncate text-footnote text-ink-3">
                            {shop.address ||
                              (shop.lat !== null && shop.lng !== null
                                ? `${shop.lat.toFixed(4)}, ${shop.lng.toFixed(4)}`
                                : 'No position \u2014 captures here are recorded, not checked')}
                          </p>
                        </div>
                        {shop.active ? <Pill tone="matched">Active</Pill> : <Pill>Inactive</Pill>}
                        <span className="tnum shrink-0 text-subhead text-ink-2">
                          {formatRadius(shop.radiusM)}
                        </span>
                      </button>
                    </ListRow>
                  ))}
                </ListSection>
              )
            })}
          </>
        )}
      </DataState>

      <ShopFormSheet open={open} onOpenChange={setOpen} shop={editing} />
    </Screen>
  )
}
