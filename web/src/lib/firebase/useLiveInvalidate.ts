import type { DocumentReference, Firestore, Query } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

type Target = (db: Firestore) => DocumentReference | Query

/**
 * Subscribes to a Firestore document or query and invalidates `queryKeys` whenever it
 * changes on the server. The first snapshot is skipped because the query just loaded.
 * Firestore is imported lazily so screens that never subscribe do not pay for it.
 * The subscription is torn down on unmount or when `watchKey` changes.
 */
export function useLiveInvalidate(watchKey: string | null, target: Target, queryKeys: QueryKey[]) {
  const qc = useQueryClient()
  const latest = useRef({ target, queryKeys })
  latest.current = { target, queryKeys }

  useEffect(() => {
    if (watchKey === null) return

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void Promise.all([import('firebase/firestore'), import('@/lib/firebase/firestore')])
      .then(([{ onSnapshot }, { db }]) => {
        if (cancelled) return
        let first = true
        unsubscribe = onSnapshot(
          latest.current.target(db) as Query,
          (snap) => {
            if (snap.metadata.fromCache) return
            if (first) {
              first = false
              return
            }
            for (const queryKey of latest.current.queryKeys) qc.invalidateQueries({ queryKey })
          },
          (err) => console.warn('live updates are off:', err.message),
        )
      })
      .catch((err: unknown) => console.warn('live updates are off:', err))

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [watchKey, qc])
}
