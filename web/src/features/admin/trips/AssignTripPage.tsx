import { useState } from 'react'
import { useNavigate } from 'react-router'

import { DataState } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { ListSection } from '@/components/ui/list'
import { todayJst } from '@/lib/format'
import { useAssignTrip } from '@/features/admin/trips/hooks'
import { useRoutes } from '@/features/admin/routes/hooks'
import { useUsers } from '@/features/admin/users/hooks'

/** Assigning a trip. */
export function AssignTripPage() {
  const navigate = useNavigate()
  const drivers = useUsers('driver')
  const routes = useRoutes()
  const assign = useAssignTrip()

  const [driverUid, setDriverUid] = useState('')
  const [routeId, setRouteId] = useState('')
  const [assignedDate, setAssignedDate] = useState(todayJst())
  const [submitted, setSubmitted] = useState(false)

  const errors: Record<string, string> = {}
  if (!driverUid) errors.driverUid = 'Choose a driver'
  if (!routeId) errors.routeId = 'Choose a route'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(assignedDate)) errors.assignedDate = 'Choose a date'
  const show = (k: string) => (submitted ? errors[k] : undefined)

  async function save() {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    try {
      const { tripId } = await assign.mutateAsync({ driverUid, routeId, assignedDate })
      navigate(`/admin/trips/${tripId}`, { replace: true })
    } catch {
    }
  }

  return (
    <Screen
      title="Assign a trip"
      back={{ to: '/admin/trips', label: 'Trips' }}
      action={
        <Button size="lg" onClick={save} pending={assign.isPending} pendingLabel="Assigning…">
          Assign trip
        </Button>
      }
    >
      <DataState query={drivers} skeleton={null}>
        {(driverList) => (
          <DataState query={routes} skeleton={null}>
            {(routeList) => {
              const activeDrivers = driverList.filter((d) => d.active)
              const activeRoutes = routeList.filter((r) => r.active)

              return (
                <ListSection footer="The route is copied into the trip as it is today. Later edits to a shop will not change this trip.">
                  <Field label="Driver" htmlFor="driver" error={show('driverUid')}>
                    <Select
                      id="driver"
                      value={driverUid}
                      onChange={(e) => setDriverUid(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {activeDrivers.map((d) => (
                        <option key={d.uid} value={d.uid}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Route" htmlFor="route" error={show('routeId')}>
                    <Select id="route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                      <option value="">Choose…</option>
                      {activeRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Date" htmlFor="date" error={show('assignedDate')}>
                    <Input
                      id="date"
                      type="date"
                      className="tnum text-right"
                      value={assignedDate}
                      onChange={(e) => setAssignedDate(e.target.value)}
                    />
                  </Field>
                </ListSection>
              )
            }}
          </DataState>
        )}
      </DataState>
    </Screen>
  )
}
