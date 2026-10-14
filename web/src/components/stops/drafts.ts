/** A stop being edited, before it is numbered and sent to the API. */
export type StopDraft = { key: string; type: 'shop' | 'home'; shopId?: string; label?: string }

export const newStopKey = () => crypto.randomUUID()

/** Returns `list` with the item at `index` swapped one place up (-1) or down (1). */
export function moveItem<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  if (to < 0 || to >= list.length) return list
  const next = list.slice()
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}
