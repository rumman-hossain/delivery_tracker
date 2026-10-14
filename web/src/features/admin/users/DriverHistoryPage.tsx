import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'

import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { TripRow } from '@/components/trip/TripRow'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ListSection } from '@/components/ui/list'
import { downloadReportCsv } from '@/features/admin/trips/api'
import { ApiError } from '@/lib/errors'
import { todayJst } from '@/lib/format'
import { useAdminTrips } from '@/features/admin/trips/hooks'
import { useUsers } from '@/features/admin/users/hooks'

const MAX_SPAN_DAYS = 92

const shiftDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const spanDays = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  )

export function DriverHistoryPage() {
  const { uid = '' } = useParams()
  const drivers = useUsers('driver')
  const driver = drivers.data?.find((d) => d.uid === uid)

  const filters = useMemo(() => ({ driver: uid, status: 'completed' as const }), [uid])
  const trips = useAdminTrips(filters)

  const today = todayJst()
  const [from, setFrom] = useState(() => shiftDays(today, -30))
  const [to, setTo] = useState(today)
  const [downloading, setDownloading] = useState(false)

  const rangeError =
    from > to
      ? 'The start date must come before the end date.'
      : spanDays(from, to) > MAX_SPAN_DAYS
        ? `Ask for ${MAX_SPAN_DAYS} days or fewer at a time.`
        : null

  async function exportCsv() {
    if (rangeError) return
    setDownloading(true)
    try {
      const blob = await downloadReportCsv({ from, to, driver: uid })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${driver?.name ?? 'driver'}-${from}-to-${to}.csv`.replace(/\s+/g, '-')

      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not download the report.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Screen
      title={driver?.name ?? 'Driver'}
      subtitle="Completed trips, newest first."
      back={{ to: '/admin/drivers', label: 'Drivers' }}
      action={
        <Button
          variant="secondary"
          size="lg"
          onClick={exportCsv}
          disabled={downloading || !!rangeError}
        >
          <Download size={18} />
          {downloading ? 'Preparing…' : 'Export these dates as CSV'}
        </Button>
      }
    >
      <ListSection
        title="Export range"
        footer={`One row per recorded event for ${driver?.name ?? 'this driver'}, between these dates.`}
      >
        <Field label="From" htmlFor="from" error={rangeError ?? undefined}>
          <Input
            id="from"
            type="date"
            className="tnum text-right"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To" htmlFor="to">
          <Input
            id="to"
            type="date"
            className="tnum text-right"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </ListSection>

      <DataState
        query={trips}
        isEmpty={(d) => d.trips.length === 0}
        empty={
          <Empty
            title="No completed trips yet"
            body="Trips appear here once the driver taps Complete at the end of a route."
          />
        }
      >
        {(data) => (
          <ListSection title="Completed trips">
            {data.trips
              .slice()
              .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate))
              .map((t) => (
                <TripRow key={t.id} trip={t} />
              ))}
          </ListSection>
        )}
      </DataState>
    </Screen>
  )
}
