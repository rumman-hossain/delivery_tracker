import { Select } from '@/components/ui/field'
import type { Shop } from '@/lib/schemas'

export const KIND_LABEL = {
  warehouse: 'Warehouses',
  shop: 'Shops',
  home: 'Home deliveries',
} as const

export function PlaceSelect({
  id,
  places,
  value,
  taken = [],
  needsPosition = false,
  onChange,
}: {
  id?: string
  places: Shop[]
  value: string
  taken?: (string | undefined)[]
  needsPosition?: boolean
  onChange: (id: string) => void
}) {
  const spoken = new Set(taken.filter(Boolean) as string[])
  const kinds = needsPosition
    ? (['warehouse', 'shop'] as const)
    : (['warehouse', 'shop', 'home'] as const)

  return (
    <Select
      id={id}
      aria-label="Place"
      className="text-left"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose a place…</option>
      {kinds.map((kind) => {
        const inKind = places.filter(
          (s) =>
            (s.kind ?? 'shop') === kind &&
            (s.active || s.id === value) &&
            (!needsPosition || (s.lat !== null && s.lng !== null)),
        )
        if (inKind.length === 0) return null
        return (
          <optgroup key={kind} label={KIND_LABEL[kind]}>
            {inKind.map((s) => (
              <option key={s.id} value={s.id} disabled={spoken.has(s.id)}>
                {s.name}
                {s.active ? '' : ' (inactive)'}
                {spoken.has(s.id) ? ' — already in this route' : ''}
              </option>
            ))}
          </optgroup>
        )
      })}
    </Select>
  )
}
