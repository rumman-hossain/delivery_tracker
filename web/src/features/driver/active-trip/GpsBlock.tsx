import { Check, LocateFixed, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatAccuracy } from '@/lib/format'
import { SectionTitle } from '@/components/ui/list'
import type { GpsState } from '@/features/driver/active-trip/types'

export function GpsBlock({ state, onRetry }: { state: GpsState; onRetry: () => void }) {
  return (
    <section className="mb-6">
      <SectionTitle as="h3">Your location</SectionTitle>
      <div className="rounded-card bg-surface px-4 py-4">
        {state.kind === 'capturing' ? (
          <div className="flex items-center gap-3">
            <LocateFixed size={22} className="shrink-0 animate-pulse text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">Getting a good GPS fix…</p>
              <p className="tnum mt-0.5 text-footnote text-ink-3">
                {state.bestAccuracyM === null
                  ? state.attempt > 1
                    ? `Trying again (${state.attempt} of ${state.attempts})`
                    : 'Hold still for a moment'
                  : `${formatAccuracy(state.bestAccuracyM)} · ${state.sampleCount} reading${state.sampleCount === 1 ? '' : 's'}` +
                    (state.attempt > 1 ? ` · try ${state.attempt}` : '')}
              </p>
            </div>
          </div>
        ) : state.kind === 'ready' ? (
          <div className="flex items-center gap-3">
            <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-matched text-on-strong">
              <Check size={14} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">Location locked</p>
              <p className="tnum mt-0.5 text-footnote text-ink-3">
                {formatAccuracy(state.fix.accuracyM)} · {state.fix.sampleCount} readings combined
              </p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Take the location again"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-ink-2"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        ) : (
          <div>
            <p className="text-body leading-snug text-ink">{state.message}</p>
            <Button variant="secondary" size="md" className="mt-3 w-full" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
