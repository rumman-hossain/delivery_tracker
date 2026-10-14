import { doc } from 'firebase/firestore'
import { Route, UserRoundCog } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { DataState } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { TripTimeline } from '@/components/trip/TripTimeline'
import { Button } from '@/components/ui/button'
import { CorrectionSheet } from '@/features/admin/trips/CorrectionSheet'
import { TripDriverSheet } from '@/features/admin/trips/TripDriverSheet'
import { TripStopsSheet } from '@/features/admin/trips/TripStopsSheet'
import { type EffectiveEvent } from '@/lib/events'
import { useLiveInvalidate } from '@/lib/firebase/useLiveInvalidate'
import { useTrip } from '@/features/admin/trips/hooks'
import { qk } from '@/lib/query/queryKeys'
import { TripMap } from '@/features/admin/trips/TripMap'
import { Summary } from '@/features/admin/trips/TripSummary'

/** One trip, reviewed. */
export function TripDetailPage() {
  const { id = '' } = useParams()
  const trip = useTrip(id)
  useLiveTrip(id)

  const [correcting, setCorrecting] = useState<{ event: EffectiveEvent; stopName: string } | null>(
    null,
  )
  const [editingStops, setEditingStops] = useState(false)
  const [changingDriver, setChangingDriver] = useState(false)

  return (
    <Screen title="Trip" back={{ to: '/admin/trips', label: 'Trips' }}>
      <DataState query={trip} skeleton={null}>
        {({ trip: t, events, photos, canAct }) => (
          <>
            <Summary trip={t} events={events} />

            {t.status !== 'completed' && canAct === true ? (
              <div className="mb-6 flex flex-col gap-2">
                <Button variant="secondary" size="lg" onClick={() => setEditingStops(true)}>
                  <Route size={18} />
                  Change the remaining stops
                </Button>
                {t.status === 'assigned' ? (
                  <Button variant="secondary" size="lg" onClick={() => setChangingDriver(true)}>
                    <UserRoundCog size={18} />
                    Change the driver
                  </Button>
                ) : null}
              </div>
            ) : null}

            {canAct === false ? (
              <p className="mb-6 rounded-card bg-surface px-4 py-3.5 text-callout leading-snug text-ink-2">
                {t.driverName} is another administrator's driver, so this trip is read-only
                for you.
              </p>
            ) : canAct === true ? null : (
              <p className="mb-6 rounded-card bg-surface px-4 py-3.5 text-callout leading-snug text-ink-2">
                This trip is read-only just now — we could not check what you may do with
                it. Reload to try again.
              </p>
            )}

            <TripMap trip={t} events={events} />

            <h2 className="mb-3 mt-8 px-1 text-footnote font-semibold text-ink-2">Timeline</h2>
            <TripTimeline
              trip={t}
              events={events}
              photos={photos}
              onCorrect={
                canAct === true
                  ? (event, stopName) => setCorrecting({ event, stopName })
                  : undefined
              }
            />

            <TripStopsSheet trip={t} open={editingStops} onOpenChange={setEditingStops} />
            <TripDriverSheet trip={t} open={changingDriver} onOpenChange={setChangingDriver} />

            <CorrectionSheet
              tripId={id}
              event={correcting?.event ?? null}
              stopName={correcting?.stopName ?? ''}
              onOpenChange={(open) => !open && setCorrecting(null)}
            />
          </>
        )}
      </DataState>
    </Screen>
  )
}

function useLiveTrip(id: string) {
  useLiveInvalidate(id || null, (db) => doc(db, 'trips', id), [qk.trip(id)])
}
