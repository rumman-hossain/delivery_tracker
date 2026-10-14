type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<(available: boolean) => void>()

function announce() {
  for (const fn of listeners) fn(deferred !== null)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    announce()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    announce()
  })
}

export function canInstall(): boolean {
  return deferred !== null
}

/** Subscribe to availability. */
export function onInstallAvailability(fn: (available: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Shows the browser's install dialog. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  announce()

  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

/** True when the app is already running from the home screen rather than a browser tab. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
