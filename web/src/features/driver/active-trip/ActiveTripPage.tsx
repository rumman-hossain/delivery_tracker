import { useParams } from 'react-router'
import { ErrorState } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { useMyTrip, useMyTrips } from '@/features/driver/hooks'
import { TripBody } from '@/features/driver/active-trip/TripBody'

/** The driver's working screen. */

export function ActiveTripPage() {
  const { id = '' } = useParams()
  const trips = useMyTrips()
  const open = trips.data?.find((t) => t.id === id)

  const fetched = useMyTrip(id, !trips.isPending && !open)
  const trip = open ?? fetched.data

  const loading = trips.isPending || (!open && fetched.isPending)

  const error = trip ? null : (fetched.error ?? trips.error)

  if (loading) return <Screen title="Trip" back={{ to: '/driver', label: 'Trips' }}>{null}</Screen>
  if (error)
    return (
      <Screen title="Trip" back={{ to: '/driver', label: 'Trips' }}>
        <ErrorState
          error={error}
          onRetry={() => {
            if (trips.error) void trips.refetch()
            if (fetched.error) void fetched.refetch()
          }}
        />
      </Screen>
    )
  if (!trip)
    return (
      <Screen title="Trip" back={{ to: '/driver', label: 'Trips' }}>
        <ErrorState error={new Error('gone')} />
      </Screen>
    )

  return <TripBody trip={trip} />
}
