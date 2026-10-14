import { ArrowDown, ArrowUp, Home, Store, Trash2 } from 'lucide-react'
import { Input, Select } from '@/components/ui/field'
import { Card } from '@/components/ui/list'
import { type StopDraft } from '@/components/stops/drafts'
import { IconAction } from '@/components/ui/icon-action'
import type { Shop, SnapshotStop } from '@/lib/schemas'

export function stopName(s: SnapshotStop) {
  return s.type === 'home' ? (s.label ?? 'Home stop') : (s.shopName ?? 'Place')
}

export function StopRow({
  draft,
  seq,
  shops,
  isNext,
  problem,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onRemove,
}: {
  draft: StopDraft
  seq: number
  shops: Shop[]
  isNext: boolean
  problem: string | null
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (by: -1 | 1) => void
  onChange: (p: Partial<StopDraft>) => void
  onRemove: () => void
}) {
  const usable = (s: Shop) => s.active || s.id === draft.shopId
  const label = (s: Shop) => (s.active ? s.name : `${s.name} (inactive)`)

  const groups: { kind: Shop['kind']; title: string }[] = [
    { kind: 'warehouse', title: 'Warehouses' },
    { kind: 'shop', title: 'Shops' },
    { kind: 'home', title: 'Home deliveries' },
  ]

  const chosen = shops.find((s) => s.id === draft.shopId)
  const isHome = draft.type === 'home' || (chosen?.kind ?? 'shop') === 'home'

  return (
    <Card>
      <div className="flex min-h-row items-center gap-2 px-4 py-2">
        <span className="tnum w-5 shrink-0 text-footnote text-ink-3">{seq}</span>
        <span className="shrink-0 text-ink-3">
          {isHome ? <Home size={17} /> : <Store size={17} />}
        </span>
        {draft.type === 'shop' ? (
          <Select
            aria-label={`Stop ${seq}`}
            className="text-left"
            value={draft.shopId ?? ''}
            onChange={(e) => onChange({ shopId: e.target.value })}
          >
            <option value="">Choose a place…</option>
            {groups.map((group) => {
              const inGroup = shops.filter((s) => (s.kind ?? 'shop') === group.kind && usable(s))
              if (inGroup.length === 0) return null
              return (
                <optgroup key={group.title} label={group.title}>
                  {inGroup.map((s) => (
                    <option key={s.id} value={s.id}>
                      {label(s)}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        ) : (
          <Input
            aria-label={`Stop ${seq} label`}
            placeholder="Who or where"
            value={draft.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        )}
      </div>

      {isNext ? (
        <p className="px-4 pb-2 text-caption text-suspect">
          The driver is on this one. Changing it changes what they are asked for next.
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="px-4 pb-2 text-footnote text-failed">
          {problem}
        </p>
      ) : null}

      <div className="flex border-t border-hairline">
        <IconAction label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ArrowUp size={18} />
        </IconAction>
        <IconAction label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)}>
          <ArrowDown size={18} />
        </IconAction>
        <IconAction label="Remove" onClick={onRemove} destructive>
          <Trash2 size={18} />
        </IconAction>
      </div>
    </Card>
  )
}
