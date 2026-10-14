import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { DataState } from '@/components/feedback/DataState'
import { RouteLine, RouteNode } from '@/components/map/RouteLine'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { Field, Input, SwitchRow } from '@/components/ui/field'
import { ListSection, SectionTitle } from '@/components/ui/list'
import { useCreateRoute, useRoute, useRoutes, useUpdateRoute } from '@/features/admin/routes/hooks'
import { useShops } from '@/features/admin/shops/hooks'
import { ran } from '@/lib/query/mutations'
import { moveItem, newStopKey, type StopDraft } from '@/components/stops/drafts'
import type { Stop } from '@/lib/schemas'
import { PlaceSelect } from '@/features/admin/routes/PlaceSelect'
import { StopEditor } from '@/features/admin/routes/StopEditor'
import { validate } from '@/features/admin/routes/validate'

export function RouteBuilder() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()

  const shops = useShops()
  const existing = useRoute(id)
  const routes = useRoutes()
  const create = useCreateRoute()
  const update = useUpdateRoute()

  const [name, setName] = useState('')
  const [startPlaceId, setStartPlaceId] = useState('')
  const [endPlaceId, setEndPlaceId] = useState('')
  const [stops, setStops] = useState<StopDraft[]>([])
  const [active, setActive] = useState(true)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const r = existing.data
    if (!r) return
    setName(r.name)
    setActive(r.active)
    setStartPlaceId(r.start.placeId)
    setEndPlaceId(r.end.placeId)
    setStops(
      r.stops
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((s) => ({ key: newStopKey(), type: s.type, shopId: s.shopId, label: s.label })),
    )
  }, [existing.data])

  const seeded = useRef(false)
  useEffect(() => {
    if (editing || seeded.current || !routes.data?.length) return
    seeded.current = true
    const last = routes.data[0]
    setStartPlaceId(last.start.placeId)
    setEndPlaceId(last.end.placeId)
  }, [editing, routes.data])

  const move = (index: number, by: -1 | 1) => setStops((prev) => moveItem(prev, index, by))

  const addStop = (type: 'shop' | 'home') =>
    setStops((prev) => [...prev, { key: newStopKey(), type, shopId: '', label: '' }])

  const patch = (key: string, p: Partial<StopDraft>) =>
    setStops((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)))

  const remove = (key: string) => setStops((prev) => prev.filter((s) => s.key !== key))

  const errors = validate({ name, startPlaceId, endPlaceId, stops })
  const pending = create.isPending || update.isPending

  async function save() {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) {
      toast.error('Fix the highlighted fields before saving.')
      return
    }

    const body = {
      name: name.trim(),
      startPlaceId,
      endPlaceId,
      stops: stops.map<Stop>((s, i) =>
        s.type === 'shop'
          ? { seq: i + 1, type: 'shop', shopId: s.shopId }
          : { seq: i + 1, type: 'home', label: s.label?.trim() },
      ),
      active,
    }

    const ok = await ran(() =>
      editing && id ? update.mutateAsync({ id, body }) : create.mutateAsync(body),
    )
    if (ok) navigate('/admin/routes')
  }

  const show = (k: string) => (submitted ? errors[k] : undefined)

  return (
    <Screen
      title={editing ? 'Edit route' : 'New route'}
      back={{ to: '/admin/routes', label: 'Routes' }}
      action={
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save route' : 'Create route'}
        </Button>
      }
    >
      <ListSection title="Route">
        <Field label="Name" htmlFor="r-name" error={show('name')}>
          <Input
            id="r-name"
            placeholder="Nakano morning"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <SwitchRow
          label="Active"
          hint="An inactive route cannot be assigned to a new trip. Trips already assigned from it are unaffected — each one froze its own copy of the route."
          checked={active}
          onCheckedChange={setActive}
        />
      </ListSection>

      <ListSection
        title="Start point"
        footer="Where the driver loads and sets off. Any registered warehouse or shop."
      >
        <Field label="Starts at" htmlFor="r-start" error={show('startPlaceId')}>
          <PlaceSelect
            id="r-start"
            places={shops.data ?? []}
            needsPosition
            value={startPlaceId}
            onChange={(id) => {
              if (endPlaceId === startPlaceId || !endPlaceId) setEndPlaceId(id)
              setStartPlaceId(id)
            }}
          />
        </Field>
      </ListSection>

      <section className="mb-7">
        <SectionTitle>
          Stops, in the order the driver runs them
        </SectionTitle>
        <p className="mb-2 px-1 text-footnote leading-snug text-ink-3">
          Reorder or remove them freely. A place already in the chain cannot be picked
          again.
        </p>

        {show('stops') ? (
          <p role="alert" className="mb-2 px-1 text-footnote text-failed">
            {show('stops')}
          </p>
        ) : null}

        <DataState query={shops} skeleton={null}>
          {(shopList) =>
            stops.length === 0 ? (
              <p className="rounded-card bg-surface px-4 py-6 text-center text-subhead text-ink-2">
                A route needs at least one stop.
              </p>
            ) : (
              <RouteLine>
                {stops.map((stop, i) => (
                  <RouteNode key={stop.key} state="upcoming" marker={i + 1} isLast={i === stops.length - 1}>
                    <StopEditor
                      stop={stop}
                      shops={shopList}
                      taken={stops.filter((o) => o.key !== stop.key).map((o) => o.shopId)}
                      error={show(`stop-${stop.key}`)}
                      canMoveUp={i > 0}
                      canMoveDown={i < stops.length - 1}
                      onMove={(by) => move(i, by)}
                      onChange={(p) => patch(stop.key, p)}
                      onRemove={() => remove(stop.key)}
                    />
                  </RouteNode>
                ))}
              </RouteLine>
            )
          }
        </DataState>

        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" onClick={() => addStop('shop')}>
            <Plus size={17} /> Place
          </Button>
          <Button variant="secondary" size="md" className="flex-1" onClick={() => addStop('home')}>
            <Plus size={17} /> Home stop
          </Button>
        </div>
      </section>

      <ListSection
        title="End point"
        footer="Where the round finishes. Usually the same depot it started from."
      >
        <Field label="Ends at" htmlFor="r-end" error={show('endPlaceId')}>
          <PlaceSelect
            id="r-end"
            places={shops.data ?? []}
            needsPosition
            value={endPlaceId}
            onChange={setEndPlaceId}
          />
        </Field>
      </ListSection>
    </Screen>
  )
}
