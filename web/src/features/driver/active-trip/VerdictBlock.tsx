import { CircleAlert, MapPinCheck } from 'lucide-react'
import { formatDistance } from '@/lib/format'
import { type Verdict } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { SectionTitle } from '@/components/ui/list'

export function VerdictBlock({ verdict, place }: { verdict: Verdict; place: string }) {
  if (verdict.kind === 'none') return null

  const at = verdict.kind === 'at'
  return (
    <section className="mb-6">
      <SectionTitle as="h3">Where you are</SectionTitle>
      <div
        className="flex items-start gap-3 rounded-card bg-surface px-4 py-4"
        role="status"
      >
        <span
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-full text-on-strong',
            at ? 'bg-matched' : 'bg-failed',
          )}
        >
          {at ? <MapPinCheck size={14} /> : <CircleAlert size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug text-ink">
            {at ? `At ${place}` : `${formatDistance(verdict.distanceM)} from ${place}`}
          </p>
          <p className="tnum mt-0.5 text-footnote leading-snug text-ink-3">
            {at
              ? `${formatDistance(verdict.distanceM)} away, inside the ${Math.round(verdict.radiusM)} m this shop allows.`
              : `Outside the ${Math.round(verdict.radiusM)} m this shop allows. This will be recorded as not delivered unless you say otherwise.`}
          </p>
        </div>
      </div>
    </section>
  )
}
