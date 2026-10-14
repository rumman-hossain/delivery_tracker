import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { fetchPhoto } from '@/lib/api/client'
import { ApiError } from '@/lib/errors'
import { qk } from '@/lib/query/queryKeys'

const FOREVER = {
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
  retry: (attempt: number, error: Error) =>
    attempt < 1 && !(error instanceof ApiError && error.status === 404),
}

function scrollParent(node: Element): Element | null {
  for (let p = node.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
      return p
    }
  }
  return null
}

function useNearViewport<T extends Element>(): [(node: T | null) => void, boolean] {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => () => observer.current?.disconnect(), [])

  const ref = useCallback(
    (node: T | null) => {
      observer.current?.disconnect()
      if (seen || !node || typeof IntersectionObserver === 'undefined') return

      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setSeen(true)
            observer.current?.disconnect()
          }
        },
        { root: scrollParent(node), rootMargin: '400px' },
      )
      observer.current.observe(node)
    },
    [seen],
  )

  return [ref, seen]
}

function useProofPhoto(path: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: qk.photo(path ?? ''),
    queryFn: ({ signal }) => fetchPhoto(path!, signal),
    enabled: !!path && enabled,
    ...FOREVER,
  })

  const blob = query.data
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  return {
    url,
    loading: query.isPending || (!!blob && !url),
    error: query.error,
  }
}

export function ProofPhoto({
  path,
  alt,
  className,
  fallback,
}: {
  path: string
  alt: string
  className?: string
  fallback?: ReactNode
}) {
  const [ref, near] = useNearViewport<HTMLElement>()
  const { url, loading, error } = useProofPhoto(path, near)

  if (url) return <img ref={ref} src={url} alt={alt} className={className} />

  if (fallback !== undefined) {
    return (
      <span ref={ref as (node: HTMLSpanElement | null) => void} className={className} aria-busy={loading || undefined}>
        {fallback}
      </span>
    )
  }

  return (
    <div
      ref={ref}
      className={`grid place-items-center bg-surface px-3 text-center text-footnote ${className ?? ''}`}
      role={error ? 'alert' : undefined}
      aria-busy={loading || undefined}
    >
      <span className={error ? 'text-suspect' : 'text-ink-3'}>
        {loading || !near
          ? 'Loading…'
          : error instanceof ApiError && error.status === 404
            ? 'This photo is no longer stored.'
            : 'The photo could not be loaded.'}
      </span>
    </div>
  )
}
