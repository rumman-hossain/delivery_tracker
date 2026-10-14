import { Download, KeyRound, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { SignOutRow } from '@/components/layout/AppShell'
import { ChangePasswordSheet } from '@/features/account/ChangePasswordSheet'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { ListSection, ListValueRow } from '@/components/ui/list'
import { useMe } from '@/features/auth/hooks'
import { canInstall, isInstalled, onInstallAvailability, promptInstall } from '@/lib/install'

/** Who you are, how to install, and the way out. */
export function AccountPage() {
  const me = useMe()
  const [installable, setInstallable] = useState(canInstall)
  const [installed] = useState(isInstalled)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => onInstallAvailability(setInstallable), [])

  async function install() {
    const accepted = await promptInstall()
    setInstallable(canInstall())
    if (accepted) toast.success('Installed. Open it from your home screen.')
  }

  return (
    <Screen title="Account">
      <ListSection>
        <ListValueRow label="Name" value={me.data?.name ?? '—'} />
        <ListValueRow label="Phone" value={me.data?.phone || '—'} />
        <ListValueRow label="Role" value="Driver" />
      </ListSection>

      {me.data?.dispatch ? (
        <ListSection
          title="Trouble at a stop"
          footer="Record the stop as it happened first — a failed delivery still counts as recorded — then call."
        >
          <a
            href={`tel:${me.data.dispatch.phone.replace(/[^\d+]/g, '')}`}
            className="flex min-h-row w-full items-center gap-3 px-4 text-body text-ink active:bg-paper"
          >
            <Phone size={18} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">Call {me.data.dispatch.name}</span>
            <span className="tnum shrink-0 text-subhead text-ink-2">{me.data.dispatch.phone}</span>
          </a>
        </ListSection>
      ) : null}

      {installed ? (
        <ListSection title="Home screen">
          <div className="px-4 py-3.5 text-subhead leading-relaxed text-ink-2">
            You're running the installed app. Location and camera work here the same as in
            the browser.
          </div>
        </ListSection>
      ) : (
        <ListSection
          title="Keep it on your home screen"
          footer="Installed, the app opens full screen and keeps you signed in between shifts."
        >
          {installable ? (
            <div className="px-4 py-3.5">
              <Button size="lg" onClick={install}>
                <Download size={18} />
                Install app
              </Button>
            </div>
          ) : null}
          <div className="px-4 py-3.5 text-subhead leading-relaxed text-ink-2">
            <p>
              <span className="font-semibold text-ink">iPhone:</span> tap the Share button in
              Safari, then “Add to Home Screen”. Safari has no install button, so this is the
              only way.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-ink">Android:</span>{' '}
              {installable
                ? 'use the button above, or the menu in Chrome, then “Install app”.'
                : 'tap the menu in Chrome, then “Install app”.'}
            </p>
          </div>
        </ListSection>
      )}

      <ListSection
        title="Location"
        footer="Your location is recorded only at the moment you tap Reached, never in the background."
      >
        <div className="px-4 py-3.5 text-subhead leading-relaxed text-ink-2">
          If location is off, the app cannot record a stop. Turn it on for this site in your
          browser settings and try the stop again.
        </div>
      </ListSection>

      <ListSection>
        <button
          type="button"
          onClick={() => setChangingPassword(true)}
          className="flex min-h-row w-full items-center gap-3 border-b border-hairline px-4 text-body text-ink active:bg-paper"
        >
          <KeyRound size={18} className="shrink-0 text-ink-3" />
          <span>Change password</span>
        </button>
        <SignOutRow />
      </ListSection>

      <ChangePasswordSheet open={changingPassword} onOpenChange={setChangingPassword} />
    </Screen>
  )
}
