import { Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { useMyTrips } from '@/features/driver/hooks'

/** The end of a trip. */
export function TripDonePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const trip = useMyTrips().data?.find((t) => t.id === id)
  const stops = trip?.routeSnapshot.stops.length ?? 0

  return (
    <div className="safe-top safe-bottom flex h-full flex-col justify-center bg-paper px-6 text-center">
      <div className="mx-auto w-full max-w-sm">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-matched text-on-strong">
          <Check size={34} strokeWidth={3} />
        </span>
        <h1 className="mt-6 text-large-title font-bold leading-tight tracking-[-0.02em] text-ink">
          Trip complete
        </h1>
        <p className="mt-2 text-body leading-snug text-ink-2">
          {stops > 0
            ? `All ${stops} stops are filed with their photos and times.`
            : 'Your stops are filed with their photos and times.'}
        </p>
        <Button size="lg" className="mt-8" onClick={() => navigate('/driver', { replace: true })}>
          Back to trips
        </Button>
      </div>
    </div>
  )
}
