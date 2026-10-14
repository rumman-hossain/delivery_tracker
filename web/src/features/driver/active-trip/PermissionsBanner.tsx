import { Camera, LocateFixed } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  isBlocked,
  needsAttention,
  readPermissions,
  requestPermissions,
  type Permissions,
} from '@/lib/permissions'

/** Asked here, on the trip screen, before the driver sets off. */

export function PermissionsBanner() {
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [asking, setAsking] = useState(false)

  const refresh = useCallback(() => {
    void readPermissions().then(setPermissions)
  }, [])

  useEffect(refresh, [refresh])

  if (!permissions || !needsAttention(permissions)) return null

  const refused = [
    permissions.camera === 'denied' ? 'camera' : null,
    permissions.geolocation === 'denied' ? 'location' : null,
  ].filter(Boolean) as string[]

  const promptable = permissions.camera === 'prompt' || permissions.geolocation === 'prompt'
  const blocked = isBlocked(permissions)

  async function ask() {
    setAsking(true)
    try {
      setPermissions(await requestPermissions())
    } finally {
      setAsking(false)
    }
  }

  return (
    <section
      role="alert"
      className="mb-6 rounded-card bg-surface px-4 py-4"
      aria-label="Permissions this app needs"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex shrink-0 gap-1 text-accent">
          <Camera size={18} />
          <LocateFixed size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-subhead font-semibold text-ink">
            {refused.length > 0
              ? `Turn the ${refused.join(' and ')} back on`
              : 'Allow the camera and your location'}
          </p>

          <p className="mt-1 text-subhead leading-snug text-ink-2">
            Every stop is recorded with a photo taken here and now, and the GPS position it
            was taken at. Neither can be skipped.
          </p>
          {refused.length > 0 ? (
            <p className="mt-1 text-subhead leading-snug text-ink-2">
              Your browser is blocking the {refused.join(' and ')} for this site. Open the
              padlock in the address bar, or this site in your browser settings, and allow{' '}
              {refused.length > 1 ? 'them' : 'it'}.
            </p>
          ) : null}

          {promptable ? (
            <Button
              size="md"
              className="mt-3 w-full"
              onClick={ask}
              disabled={asking}
              data-testid="allow-permissions"
            >
              {asking ? 'Waiting for you…' : 'Allow'}
            </Button>
          ) : null}

          {blocked ? (
            <Button variant="secondary" size="md" className="mt-3 w-full" onClick={refresh}>
              I have turned them on
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
