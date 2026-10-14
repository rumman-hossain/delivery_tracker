import { type StopDraft } from '@/components/stops/drafts'

export function validate(v: {
  name: string
  startPlaceId: string
  endPlaceId: string
  stops: StopDraft[]
}): Record<string, string> {
  const out: Record<string, string> = {}
  if (!v.name.trim()) out.name = 'Give the route a name'
  if (!v.startPlaceId) out.startPlaceId = 'Choose where the route starts'
  if (!v.endPlaceId) out.endPlaceId = 'Choose where the route ends'
  if (v.stops.length === 0) out.stops = 'A route needs at least one stop'

  const seen = new Map<string, number>()

  v.stops.forEach((s, i) => {
    if (s.type === 'home') {
      if (!s.label?.trim()) out[`stop-${s.key}`] = 'Label this home stop'
      return
    }
    if (!s.shopId) {
      out[`stop-${s.key}`] = 'Choose a shop for this stop'
      return
    }
    const first = seen.get(s.shopId)
    if (first !== undefined) {
      out[`stop-${s.key}`] = `Already stop ${first + 1}. A route calls at each place once.`
      return
    }
    seen.set(s.shopId, i)
  })

  return out
}
