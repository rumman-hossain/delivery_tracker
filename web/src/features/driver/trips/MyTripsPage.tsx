import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { TripPill } from '@/components/trip/StatusPill'
import { Button } from '@/components/ui/button'
import { ListRow, ListSection } from '@/components/ui/list'
import { formatTripDate } from '@/lib/format'
import { useMyHistory, useMyTrips } from '@/features/driver/hooks'
import { recordedCount, routeTitle } from '@/lib/trip'
import type { Trip } from '@/lib/schemas'

/** The driver's day. */
export function MyTripsPage() {
  const trips = useMyTrips()

  return (
    <Screen title="Trips" subtitle="Tap a trip to start it or carry on.">
      <DataState
        query={trips}
        empty={
          <Empty
            title="Nothing assigned yet"
            body="When your administrator assigns you a route, it shows up here."
          />
        }
      >
        {(open) => (
          <>
            {open.length > 0 ? (
              <ListSection title="To do">
                {open.slice().sort(byDateDesc).map((t) => (
                  <TripRow key={t.id} trip={t} />
                ))}
              </ListSection>
            ) : (
              <Empty
                title="You're all caught up"
                body="No trips waiting. Finished trips stay below for your records."
              />
            )}
          </>
        )}
      </DataState>

      <History />
    </Screen>
  )
}

const byDateDesc = (a: Trip, b: Trip) => b.assignedDate.localeCompare(a.assignedDate)

function History() {
  const [limit, setLimit] = useState(PAGE)
  const history = useMyHistory(limit)

  const [lastGood, setLastGood] = useState<{ trips: Trip[]; truncated: boolean }>({
    trips: [],
    truncated: false,
  })
  useEffect(() => {
    if (history.data)
      setLastGood({ trips: history.data.trips, truncated: history.data.truncated ?? false })
  }, [history.data])

  const trips = history.data?.trips ?? lastGood.trips
  if (trips.length === 0) return null

  const truncated = history.data ? (history.data.truncated ?? false) : lastGood.truncated
  const failed = history.isError && !history.isFetching

  return (
    <ListSection title="Finished" className="mt-7">
      {trips.map((t) => (
        <TripRow key={t.id} trip={t} />
      ))}
      {truncated ? (
        <div className="px-4 py-3">
          {trips.length >= MAX_HISTORY ? (
            <p className="text-footnote leading-snug text-ink-3">
              Showing your most recent {MAX_HISTORY} trips. Ask your administrator for a
              report if you need older ones.
            </p>
          ) : (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              disabled={history.isFetching}
              onClick={() =>
                failed ? history.refetch() : setLimit((n) => Math.min(n + PAGE, MAX_HISTORY))
              }
            >
              {history.isFetching ? 'Loading…' : failed ? 'Try again' : 'Show more'}
            </Button>
          )}
        </div>
      ) : null}
    </ListSection>
  )
}

const PAGE = 20

const MAX_HISTORY = 500

function TripRow({ trip }: { trip: Trip }) {
  const stops = trip.routeSnapshot.stops.length

  return (
    <ListRow interactive className="p-0">
      <Link
        to={`/driver/trips/${trip.id}`}
        className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-semibold text-ink">{routeTitle(trip)}</p>
          <p className="tnum mt-0.5 text-footnote text-ink-3">
            {formatTripDate(trip.assignedDate)} — {recordedCount(trip)} of {stops} stops recorded
          </p>
        </div>
        <TripPill status={trip.status} />
        <ChevronRight size={18} className="shrink-0 text-ink-3" />
      </Link>
    </ListRow>
  )
}
