import type { ReactNode } from 'react'

import { ApiError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Loading, empty and failed are three different messages, not three spinners. */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-hairline/70', className)} />
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex min-h-row items-center gap-3 border-b border-hairline px-4 last:border-b-0">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message : 'Something went wrong loading this screen.'
  return (
    <div className="rounded-card bg-surface px-5 py-8 text-center">
      <p className="text-body text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="md" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-card bg-surface px-5 py-10 text-center">
      <p className="text-headline font-semibold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-[34ch] text-callout leading-snug text-ink-2">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** The three states in one place, so no list screen forgets one of them. */
export function DataState<T>({
  query,
  empty,
  isEmpty,
  children,
  skeleton,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => void }
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const data = query.data as T
  const blank = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0
  if (empty && blank) return <>{empty}</>

  return <>{children(data)}</>
}
