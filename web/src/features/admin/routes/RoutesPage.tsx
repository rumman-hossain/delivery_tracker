import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { Pill } from '@/components/trip/StatusPill'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { ListRow, ListSection } from '@/components/ui/list'
import { useRoutes, useUpdateRoute } from '@/features/admin/routes/hooks'
import { ran } from '@/lib/query/mutations'
import type { Route as RouteT } from '@/lib/schemas'

export function RoutesPage() {
  return (
    <Screen
      title="Routes"
      subtitle="An ordered run of stops, assigned to a driver for a date."
      trailing={
        <Button variant="plain" size="icon" asChild aria-label="New route">
          <Link to="/admin/routes/new">
            <Plus size={24} strokeWidth={2.4} />
          </Link>
        </Button>
      }
    >
      <RoutesList />
    </Screen>
  )
}

function RoutesList() {
  const routes = useRoutes()
  const update = useUpdateRoute()
  const [toToggle, setToToggle] = useState<RouteT | null>(null)

  return (
    <DataState
      query={routes}
      empty={
        <Empty
          title="No routes yet"
          body="Build a route from your shops, then assign it to a driver."
          action={
            <Button size="md" asChild>
              <Link to="/admin/routes/new">New route</Link>
            </Button>
          }
        />
      }
    >
      {(list) => (
        <>
          <ListSection>
            {list.map((r) => (
              <ListRow key={r.id} className="gap-2 p-0">
                <Link
                  to={`/admin/routes/${r.id}`}
                  className="flex min-h-row-lg min-w-0 flex-1 items-center gap-2 py-2.5 pl-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{r.name}</p>
                    <p className="truncate text-footnote text-ink-3">{summary(r)}</p>
                  </div>
                  {!r.active ? <Pill>Inactive</Pill> : null}
                  <ChevronRight size={18} className="shrink-0 text-ink-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => setToToggle(r)}
                  className="min-h-row-lg shrink-0 px-4 text-subhead font-semibold text-accent"
                >
                  {r.active ? 'Turn off' : 'Turn on'}
                </button>
              </ListRow>
            ))}
          </ListSection>

          <ConfirmDialog
            open={!!toToggle}
            onOpenChange={(v) => !v && setToToggle(null)}
            title={toToggle?.active ? `Turn off ${toToggle.name}?` : `Turn on ${toToggle?.name}?`}
            body={
              toToggle?.active
                ? 'It stops appearing when you assign a trip. Trips already assigned from it are unaffected — each one froze its own copy of the route.'
                : 'It becomes available again when assigning a trip.'
            }
            confirmLabel={toToggle?.active ? 'Turn off' : 'Turn on'}
            pending={update.isPending}
            onConfirm={async () => {
              if (!toToggle) return
              const ok = await ran(() =>
                update.mutateAsync({ id: toToggle.id, body: { active: !toToggle.active } }),
              )
              if (ok) setToToggle(null)
            }}
          />
        </>
      )}
    </DataState>
  )
}

function summary(r: RouteT) {
  const shops = r.stops.filter((s) => s.type === 'shop').length
  const homes = r.stops.length - shops
  const parts = [`${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}`]
  if (shops) parts.push(`${shops} shop${shops === 1 ? '' : 's'}`)
  if (homes) parts.push(`${homes} home`)
  const ends = r.start.placeId === r.end.placeId ? r.start.name : `${r.start.name} → ${r.end.name}`
  return `${ends} · ${parts.join(', ')}`
}
