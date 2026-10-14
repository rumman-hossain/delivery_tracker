import { doc } from 'firebase/firestore'

import { useLiveInvalidate } from '@/lib/firebase/useLiveInvalidate'
import { qk } from '@/lib/query/queryKeys'

/** Refreshes the driver's trip screens when their trip changes on the server. */
export function useLiveTripWatch(tripId: string | undefined) {
  useLiveInvalidate(tripId ?? null, (db) => doc(db, 'trips', tripId!), [qk.nextStop(tripId ?? ''), qk.myTrips])
}
