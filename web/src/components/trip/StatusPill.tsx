import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { Delivery, Match, TripStatus } from '@/lib/schemas'

const tone = {
  neutral: 'bg-hairline/50 text-ink-2',
  matched: 'bg-matched-soft text-matched',
  suspect: 'bg-suspect-soft text-suspect',
  failed: 'bg-failed-soft text-failed',
  accent: 'bg-accent-soft text-accent',
} as const

export function Pill({
  children,
  tone: t = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: keyof typeof tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-caption font-semibold',
        tone[t],
        className,
      )}
    >
      {children}
    </span>
  )
}

const MATCH: Record<Match, { label: string; tone: keyof typeof tone }> = {
  matched: { label: 'At the shop', tone: 'matched' },
  suspect: { label: 'Away from the shop', tone: 'suspect' },
  na: { label: 'No location check', tone: 'neutral' },
}

export const MatchPill = ({ status }: { status: Match }) => (
  <Pill tone={MATCH[status].tone}>{MATCH[status].label}</Pill>
)

const DELIVERY: Record<Delivery, { label: string; tone: keyof typeof tone }> = {
  delivered: { label: 'Delivered', tone: 'matched' },
  partial: { label: 'Partly delivered', tone: 'suspect' },
  failed: { label: 'Not delivered', tone: 'failed' },
}

export const DeliveryPill = ({ status }: { status: Delivery }) => (
  <Pill tone={DELIVERY[status].tone}>{DELIVERY[status].label}</Pill>
)

const TRIP: Record<TripStatus, { label: string; tone: keyof typeof tone }> = {
  assigned: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'On route', tone: 'accent' },
  completed: { label: 'Completed', tone: 'matched' },
}

export const TripPill = ({ status }: { status: TripStatus }) => (
  <Pill tone={TRIP[status].tone}>{TRIP[status].label}</Pill>
)
