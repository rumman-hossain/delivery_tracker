import { ArrowDown, ArrowUp, Home, Store, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Card } from '@/components/ui/list'
import { type StopDraft } from '@/components/stops/drafts'
import { IconAction } from '@/components/ui/icon-action'
import type { Shop } from '@/lib/schemas'
import { PlaceSelect } from '@/features/admin/routes/PlaceSelect'

export function StopEditor({
  stop,
  shops,
  taken,
  error,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onRemove,
}: {
  stop: StopDraft
  shops: Shop[]
  taken: (string | undefined)[]
  error?: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (by: -1 | 1) => void
  onChange: (p: Partial<StopDraft>) => void
  onRemove: () => void
}) {
  return (
    <Card className="mt-1.5">
      <div className="flex min-h-row items-center gap-2 px-4 py-2">
        <span className="shrink-0 text-ink-3">
          {stop.type === 'home' ? <Home size={17} /> : <Store size={17} />}
        </span>
        {stop.type === 'shop' ? (
          <PlaceSelect
            places={shops}
            value={stop.shopId ?? ''}
            taken={taken}
            onChange={(shopId) => onChange({ shopId })}
          />
        ) : (
          <Input
            aria-label="Home stop label"
            placeholder="Who or where, e.g. Sato-san 3F"
            value={stop.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        )}
      </div>

      {error ? (
        <p role="alert" className="px-4 pb-2 text-footnote text-failed">
          {error}
        </p>
      ) : null}

      <div className="flex border-t border-hairline">
        <IconAction label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ArrowUp size={18} />
        </IconAction>
        <IconAction label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)}>
          <ArrowDown size={18} />
        </IconAction>
        <IconAction label="Remove stop" onClick={onRemove} destructive>
          <Trash2 size={18} />
        </IconAction>
      </div>
    </Card>
  )
}
