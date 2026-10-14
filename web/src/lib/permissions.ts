/** The two permissions the job cannot be done without. */

export type PermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unknown'

export type Permissions = { geolocation: PermissionState; camera: PermissionState }

async function query(name: string): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor)
    return status.state as PermissionState
  } catch {
    return 'unknown'
  }
}

export async function readPermissions(): Promise<Permissions> {
  const [geolocation, camera] = await Promise.all([query('geolocation'), query('camera')])
  return { geolocation, camera }
}

/** Whether the driver should be told something is missing. */
export function needsAttention(p: Permissions): boolean {
  return (
    p.geolocation === 'denied' ||
    p.geolocation === 'prompt' ||
    p.camera === 'denied' ||
    p.camera === 'prompt'
  )
}

/** True once either permission has been refused outright, which a prompt cannot undo. */
export function isBlocked(p: Permissions): boolean {
  return p.geolocation === 'denied' || p.camera === 'denied'
}

/** Triggers the browser's own prompts, which is the only way to ask. */
export async function requestPermissions(): Promise<Permissions> {
  const camera = navigator.mediaDevices
    ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((stream) => stream.getTracks().forEach((t) => t.stop()))
    .catch(() => undefined)

  const location = new Promise<void>((resolve) => {
    if (!navigator.geolocation) return resolve()
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { timeout: 10_000 },
    )
  })

  await Promise.all([camera, location])
  return readPermissions()
}
