import { collection, limit, orderBy, query as fsQuery, where } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { TripRow } from '@/components/trip/TripRow'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { ListSection } from '@/components/ui/list'
import type { TripFilters } from '@/features/admin/trips/api'
import { useLiveInvalidate } from '@/lib/firebase/useLiveInvalidate'
import { useAdminTrips } from '@/features/admin/trips/hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { qk } from '@/lib/query/queryKeys'
import type { TripStatus } from '@/lib/schemas'

const STATUSES: { value: TripStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'assigned', label: 'Not started' },
  { value: 'in_progress', label: 'On route' },
  { value: 'completed', label: 'Completed' },
]

export function TripsListPage() {
  const [driver, setDriver] = useState('')
  const [status, setStatus] = useState<TripStatus | ''>('')
  const [date, setDate] = useState('')

  const filters: TripFilters = useMemo(
    () => ({
      driver: driver || undefined,
      status: status || undefined,
      date: date || undefined,
    }),
    [driver, status, date],
  )

  const filtered = !!(driver || status || date)

  const trips = useAdminTrips(filters)
  const drivers = useUsers('driver')
  useLiveTrips(filters)

  const clearFilters = () => {
    setDriver('')
    setStatus('')
    setDate('')
  }

  return (
    <Screen
      title="Trips"
      subtitle="Assigned work and what came back from the road."
      trailing={
        <Button variant="plain" size="icon" asChild aria-label="Assign a trip">
          <Link to="/admin/trips/new">
            <Plus size={24} strokeWidth={2.4} />
          </Link>
        </Button>
      }
    >
      <ListSection>
        <Field label="Driver" htmlFor="f-driver">
          <Select id="f-driver" value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">All drivers</option>
            {(drivers.data ?? []).map((d) => (
              <option key={d.uid} value={d.uid}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select
            id="f-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TripStatus | '')}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Date"
          htmlFor="f-date"
          hint={date ? undefined : 'Any date'}
        >
          <div className="flex items-center gap-2">
            <Input
              id="f-date"
              type="date"
              className="tnum text-right"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {date ? (
              <button
                type="button"
                onClick={() => setDate('')}
                className="shrink-0 text-callout font-semibold text-accent"
              >
                Clear
              </button>
            ) : null}
          </div>
        </Field>
      </ListSection>

      <DataState
        query={trips}
        isEmpty={(d) => d.trips.length === 0}
        empty={
          <Empty
            title={filtered ? 'Nothing matches those filters' : 'No trips yet'}
            body={
              filtered
                ? 'Clear a filter to see more.'
                : 'Assign a route to a driver for a date and it appears here.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="md" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button size="md" asChild>
                  <Link to="/admin/trips/new">Assign a trip</Link>
                </Button>
              )
            }
          />
        }
      >
        {(data) => (
          <>
            {data.truncated ? (
              <p className="mb-3 rounded-card bg-suspect-soft px-4 py-3 text-callout leading-snug text-suspect">
                Showing the first {data.limit ?? data.trips.length} trips. Narrow the filters
                by driver, date or status to see the rest.
              </p>
            ) : null}
            <ListSection>
              {data.trips.map((t) => (
                <TripRow key={t.id} trip={t} />
              ))}
            </ListSection>
          </>
        )}
      </DataState>
    </Screen>
  )
}

function useLiveTrips(filters: TripFilters) {
  useLiveInvalidate(
    JSON.stringify(filters),
    (db) => {
      const clauses = []
      if (filters.driver) clauses.push(where('driverUid', '==', filters.driver))
      if (filters.status) clauses.push(where('status', '==', filters.status))
      if (filters.date) clauses.push(where('assignedDate', '==', filters.date))
      if (!filters.status) clauses.push(where('status', 'in', LIVE_STATUSES))
      return fsQuery(collection(db, 'trips'), ...clauses, orderBy('createdAt', 'desc'), limit(LIVE_WINDOW))
    },
    [qk.adminTrips(filters)],
  )
}

const LIVE_STATUSES: TripStatus[] = ['assigned', 'in_progress']

const LIVE_WINDOW = 100
