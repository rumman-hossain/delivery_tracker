import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** A route is a line. */

export type NodeState = 'done' | 'current' | 'upcoming'

export function RouteLine({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn('list-none', className)}>{children}</ol>
}

export function RouteNode({
  state,
  marker,
  isFirst,
  isLast,
  children,
  className,
}: {
  state: NodeState
  marker?: ReactNode
  isFirst?: boolean
  isLast?: boolean
  children: ReactNode
  className?: string
}) {
  const strokeAbove = state === 'upcoming' ? 'bg-hairline' : 'bg-accent'
  const strokeBelow = state === 'done' ? 'bg-accent' : 'bg-hairline'

  return (
    <li className={cn('relative flex gap-3', className)}>
      <div className="relative flex w-7 shrink-0 justify-center" aria-hidden>
        <span className={cn('absolute top-0 h-5 w-[3px] rounded-full', strokeAbove, isFirst && 'opacity-0')} />
        <span className={cn('absolute bottom-0 top-9 w-[3px] rounded-full', strokeBelow, isLast && 'opacity-0')} />
        <Dot state={state} marker={marker} />
      </div>
      <div className={cn('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-5')}>{children}</div>
    </li>
  )
}

function Dot({ state, marker }: { state: NodeState; marker?: ReactNode }) {
  const base =
    'relative z-10 mt-4 grid size-7 shrink-0 place-items-center rounded-full text-caption font-bold ' +
    'transition-colors duration-300'

  if (state === 'done') {
    return <span className={cn(base, 'bg-accent text-on-strong')}>{marker}</span>
  }
  if (state === 'current') {
    return (
      <span
        className={cn(
          base,
          'bg-surface text-accent ring-[3px] ring-accent ring-offset-2 ring-offset-paper',
        )}
      >
        {marker}
      </span>
    )
  }
  return (
    <span className={cn(base, 'border-2 border-hairline bg-surface text-ink-3')}>{marker}</span>
  )
}
