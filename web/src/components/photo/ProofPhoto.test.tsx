import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProofPhoto } from '@/components/photo/ProofPhoto'
import { ApiError } from '@/lib/errors'

const { fetchPhoto } = vi.hoisted(() => ({ fetchPhoto: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ fetchPhoto }))
vi.mock('@/lib/firebase/firebase', () => ({ auth: { currentUser: null } }))

const PATH = '/admin/trips/t1/events/e1/photo'

function renderPhoto(children: React.ReactNode, container?: HTMLElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>, {
    container,
  })
}

function stubObserver() {
  const observed: Element[] = []
  const options: IntersectionObserverInit[] = []
  let fire: (entries: { isIntersecting: boolean }[]) => void = () => {}

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void, init?: IntersectionObserverInit) {
        fire = cb
        options.push(init ?? {})
      }
      observe(node: Element) {
        observed.push(node)
      }
      disconnect() {}
    },
  )

  return { observed, options, fire: (e: { isIntersecting: boolean }[]) => fire(e) }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchPhoto.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  URL.createObjectURL = vi.fn(() => 'blob:photo')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => vi.unstubAllGlobals())

describe('ProofPhoto', () => {
  it('fetches the bytes through the API and shows them', async () => {
    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo for Lawson Nakano" />)

    const img = await screen.findByAltText('Proof photo for Lawson Nakano')
    expect(img).toHaveAttribute('src', 'blob:photo')
    expect(fetchPhoto).toHaveBeenCalledWith(PATH, expect.anything())
    expect(img.getAttribute('src')).not.toContain('storage.googleapis.com')
  })

  it('costs one download when the same photo is shown twice', async () => {
    renderPhoto(
      <>
        <ProofPhoto path={PATH} alt="thumbnail" />
        <ProofPhoto path={PATH} alt="full size" />
      </>,
    )

    await screen.findByAltText('full size')
    expect(fetchPhoto).toHaveBeenCalledTimes(1)
  })

  it('says so when the photo is no longer stored', async () => {
    fetchPhoto.mockRejectedValue(new ApiError('NOT_FOUND', 404))
    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('This photo is no longer stored.')
    expect(screen.queryByAltText('Proof photo')).not.toBeInTheDocument()
  })

  it('distinguishes a failed load from a missing photo', async () => {
    fetchPhoto.mockRejectedValue(new ApiError('OFFLINE', 0))
    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />)

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'The photo could not be loaded.',
    )
  })

  it('waits until it is near the viewport before downloading', async () => {
    const { observed, options, fire } = stubObserver()

    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />)

    expect(observed).toHaveLength(1)
    expect(fetchPhoto).not.toHaveBeenCalled()
    expect(options[0].rootMargin).toBe('400px')

    fire([{ isIntersecting: true }])
    await screen.findByAltText('Proof photo')
    expect(fetchPhoto).toHaveBeenCalledTimes(1)
  })

  it('watches the container that actually scrolls, not the viewport', async () => {
    const { options } = stubObserver()

    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    Object.defineProperty(scroller, 'clientHeight', { value: 500 })
    document.body.append(scroller)

    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />, scroller)

    expect(options).toHaveLength(1)
    expect(options[0].root).toBe(scroller)
  })

  it('ignores an ancestor that does not overflow', async () => {
    const { options } = stubObserver()

    const box = document.createElement('div')
    box.style.overflowY = 'auto'
    document.body.append(box)

    renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />, box)

    expect(options).toHaveLength(1)
    expect(options[0].root ?? null).toBeNull()
  })

  it('lets go of the object URL when it goes away', async () => {
    const { unmount } = renderPhoto(<ProofPhoto path={PATH} alt="Proof photo" />)
    await screen.findByAltText('Proof photo')

    unmount()
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo'))
  })
})
