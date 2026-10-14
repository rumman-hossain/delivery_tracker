import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PermissionsBanner } from '@/features/driver/active-trip/PermissionsBanner'

const state = { geolocation: 'granted', camera: 'granted' } as Record<string, string>

function stubPermissions() {
  vi.stubGlobal('navigator', {
    ...navigator,
    permissions: {
      query: ({ name }: { name: string }) =>
        state[name] === 'unsupported'
          ? Promise.reject(new TypeError('unsupported'))
          : Promise.resolve({ state: state[name] }),
    },
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    },
    geolocation: { getCurrentPosition: (ok: () => void) => ok() },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.geolocation = 'granted'
  state.camera = 'granted'
  stubPermissions()
})

describe('PermissionsBanner', () => {
  it('says nothing when both are already granted', async () => {
    render(<PermissionsBanner />)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('offers to ask when they have not been asked for yet', async () => {
    state.camera = 'prompt'
    state.geolocation = 'prompt'
    render(<PermissionsBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/allow the camera and your location/i)

    const user = userEvent.setup()
    state.camera = 'granted'
    state.geolocation = 'granted'
    await user.click(screen.getByTestId('allow-permissions'))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('does not pretend it can ask again once refused', async () => {
    state.camera = 'denied'
    render(<PermissionsBanner />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/turn the camera back on/i)
    expect(screen.queryByTestId('allow-permissions')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I have turned them on' })).toBeInTheDocument()
  })

  it('names both when both are refused', async () => {
    state.camera = 'denied'
    state.geolocation = 'denied'
    render(<PermissionsBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/turn the camera and location back on/i)
  })

  it('stays quiet when the browser will not say and nothing else is wrong', async () => {
    state.camera = 'unsupported'
    render(<PermissionsBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('names only the permission that was actually refused', async () => {
    state.camera = 'denied'
    state.geolocation = 'unsupported'
    render(<PermissionsBanner />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/turn the camera back on/i)
    expect(alert).not.toHaveTextContent(/location/i)
  })

  it('still asks for what can still be asked for, even while something is refused', async () => {
    state.camera = 'denied'
    state.geolocation = 'prompt'
    render(<PermissionsBanner />)

    const alert = await screen.findByRole('alert')
    expect(screen.getByTestId('allow-permissions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I have turned them on' })).toBeInTheDocument()

    expect(alert).toHaveTextContent(/blocking the camera for this site/i)
    expect(alert).not.toHaveTextContent(/blocking the camera and location/i)
    expect(alert).toHaveTextContent(/Neither can be skipped/i)
  })

  it('still speaks up when the browser will not say but location is refused', async () => {
    state.camera = 'unsupported'
    state.geolocation = 'denied'
    render(<PermissionsBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/turn the location back on/i)
  })
})
