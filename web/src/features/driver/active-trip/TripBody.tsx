import { useQueryClient } from '@tanstack/react-query'
import { Flag, Home, MapPin, Store } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PermissionsBanner } from '@/features/driver/active-trip/PermissionsBanner'
import { ReachedFlow } from '@/features/driver/active-trip/ReachedFlow'
import { DataState } from '@/components/feedback/DataState'
import { RouteLine, RouteNode } from '@/components/map/RouteLine'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { formatLocalTime, formatTripDate } from '@/lib/format'
import { captureFix } from '@/lib/gps'
import { useCompleteTrip, useNextStop, useStartTrip } from '@/features/driver/hooks'
import { ran } from '@/lib/query/mutations'
import { useLiveTripWatch } from '@/lib/firebase/liveTrip'
import { qk } from '@/lib/query/queryKeys'
import { routeTitle, stopName } from '@/lib/trip'
import type { Trip } from '@/lib/schemas'
import { stopState } from '@/features/driver/active-trip/StopCards'
import { stopMeta } from '@/features/driver/active-trip/StopCards'
import { RouteChangedNote } from '@/features/driver/active-trip/StopCards'
import { NodeHeader } from '@/features/driver/active-trip/StopCards'
import { CurrentStopCard } from '@/features/driver/active-trip/StopCards'

export function TripBody({ trip }: { trip: Trip }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const live = trip.status !== 'completed'
  const next = useNextStop(trip.id, live)

  useLiveTripWatch(live ? trip.id : undefined)
  const start = useStartTrip()
  const complete = useCompleteTrip()

  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [reachedOpen, setReachedOpen] = useState(false)

  const stops = trip.routeSnapshot.stops
  const notStarted = trip.status === 'assigned'
  const finished = trip.status === 'completed'
  const allRecorded = next.data?.done === true

  async function bestEffortFix() {
    try {
      const fix = await captureFix({ windowMs: 2500, minSamples: 3, attempts: 1 })
      return { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, clientTime: fix.clientTime }
    } catch {
      return { clientTime: new Date().toISOString() }
    }
  }

  async function onStart() {
    const body = await bestEffortFix()
    if (await ran(() => start.mutateAsync({ id: trip.id, body }))) setConfirmStart(false)
  }

  async function onComplete() {
    const body = await bestEffortFix()
    if (!(await ran(() => complete.mutateAsync({ id: trip.id, body })))) return
    setConfirmComplete(false)
    navigate(`/driver/trips/${trip.id}/done`, { replace: true })
  }

  const action = finished ? null : notStarted ? (
    <Button size="lg" onClick={() => setConfirmStart(true)} disabled={start.isPending}>
      {start.isPending ? 'Starting…' : 'Start this trip'}
    </Button>
  ) : allRecorded ? (
    <Button size="lg" onClick={() => setConfirmComplete(true)} disabled={complete.isPending}>
      {complete.isPending ? 'Completing…' : 'Complete trip'}
    </Button>
  ) : next.data?.seq ? (
    <Button size="lg" onClick={() => setReachedOpen(true)}>
      Reached stop {next.data.seq}
    </Button>
  ) : null

  return (
    <Screen
      title={routeTitle(trip)}
      subtitle={`${formatTripDate(trip.assignedDate)}, ${stops.length} stop${stops.length === 1 ? '' : 's'}`}
      back={{ to: '/driver', label: 'Trips' }}
      action={action}
    >
      {finished ? null : <PermissionsBanner />}

      {notStarted ? (
        <p className="mb-6 rounded-card bg-surface px-4 py-3.5 text-subhead leading-snug text-ink-2">
          Tap Start when you leave {trip.routeSnapshot.start.name}. Your stops unlock one at a
          time, in order.
        </p>
      ) : null}

      <DataState query={next} skeleton={null}>
        {(nextStop) => (
          <>
            {nextStop.note ? <RouteChangedNote note={nextStop.note} /> : null}
            <RouteLine>
              <RouteNode state={notStarted ? 'upcoming' : 'done'} marker={<MapPin size={13} />} isFirst>
                <NodeHeader
                  title={trip.routeSnapshot.start.name}
                  meta={trip.startedAt ? `Left at ${formatLocalTime(trip.startedAt)}` : 'Start'}
                />
              </RouteNode>

              {stops.map((stop) => {
                const state = stopState(stop, trip)
                const isCurrent = state === 'current' && !finished
                return (
                  <RouteNode key={stop.seq} state={state} marker={stop.seq}>
                    <NodeHeader
                      title={stopName(stop)}
                      meta={stopMeta(stop, state)}
                      icon={stop.type === 'home' ? <Home size={13} /> : <Store size={13} />}
                      emphasis={isCurrent}
                    />
                    {isCurrent && nextStop.seq === stop.seq ? (
                      <CurrentStopCard stop={stop} />
                    ) : null}
                  </RouteNode>
                )
              })}

              <RouteNode state={finished ? 'done' : 'upcoming'} marker={<Flag size={13} />} isLast>
                <NodeHeader
                  title={`Back to ${trip.routeSnapshot.end.name}`}
                  meta={trip.completedAt ? `Finished at ${formatLocalTime(trip.completedAt)}` : 'End of route'}
                />
              </RouteNode>
            </RouteLine>
          </>
        )}
      </DataState>

      {next.data?.seq && !finished ? (
        <ReachedFlow
          tripId={trip.id}
          stop={next.data}
          open={reachedOpen}
          onOpenChange={setReachedOpen}
          onRecorded={() => qc.invalidateQueries({ queryKey: qk.nextStop(trip.id) })}
        />
      ) : null}

      <ConfirmDialog
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title="Start this trip?"
        body="Your start time is recorded now and your first stop unlocks."
        confirmLabel="Start trip"
        pending={start.isPending}
        onConfirm={onStart}
      />
      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title="Complete this trip?"
        body="Every stop is recorded. This closes the trip and you cannot reopen it."
        confirmLabel="Complete trip"
        pending={complete.isPending}
        onConfirm={onComplete}
      />
    </Screen>
  )
}
