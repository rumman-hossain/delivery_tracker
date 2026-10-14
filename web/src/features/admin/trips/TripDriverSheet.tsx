import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useReassignTrip } from '@/features/admin/trips/hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { ran } from '@/lib/query/mutations'
import { Card } from '@/components/ui/list'
import type { Trip } from '@/lib/schemas'

/** Handing a trip to somebody else. */
export function TripDriverSheet({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const drivers = useUsers('driver')
  const reassign = useReassignTrip(trip.id)
  const [picked, setPicked] = useState(trip.driverUid)

  useEffect(() => {
    if (open) setPicked(trip.driverUid)
  }, [open, trip.driverUid])

  const available = (drivers.data ?? []).filter((d) => d.active)
  const unchanged = picked === trip.driverUid

  async function save() {
    if (unchanged) return onOpenChange(false)
    if (await ran(() => reassign.mutateAsync(picked))) onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Change the driver"
      description={`Currently ${trip.driverName}`}
      footer={
        <Button size="lg" onClick={save} disabled={unchanged} pending={reassign.isPending} pendingLabel="Handing it over…">
          Hand it over
        </Button>
      }
    >
      <Card className="mb-6">
        <Field
          label="Driver"
          htmlFor="trip-driver"
          hint={
            drivers.isError
              ? 'The list of drivers could not be loaded.'
              : 'They see this trip on their phone as soon as you hand it over.'
          }
        >
          <Select
            id="trip-driver"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            disabled={drivers.isPending || drivers.isError}
          >
            {available.map((d) => (
              <option key={d.uid} value={d.uid}>
                {d.name}
              </option>
            ))}
            {available.some((d) => d.uid === trip.driverUid) ? null : (
              <option value={trip.driverUid}>{trip.driverName}</option>
            )}
          </Select>
        </Field>
      </Card>

      <p className="px-1 text-footnote leading-snug text-ink-3">
        The stops, the route and the date stay as they are. Only who runs it changes.
      </p>
    </Sheet>
  )
}
