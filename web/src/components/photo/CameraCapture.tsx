import { Camera, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cameraMessage, CameraFailure, closeCamera, openCamera } from '@/lib/camera'
import { captureFrame, TooBlurry } from '@/lib/stamp'
import { cn } from '@/lib/utils'

type Shot = { blob: Blob }

export function CameraCapture({
  place,
  position,
  shot,
  onShot,
  className,
}: {
  place: string
  position?: string
  shot: Shot | null
  onShot: (shot: Shot | null) => void
  className?: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)

  const wanted = useRef(0)

  const stop = useCallback(() => {
    wanted.current++
    closeCamera(stream.current)
    stream.current = null
  }, [])

  const [preview, setPreview] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const start = useCallback(async () => {
    const ticket = ++wanted.current
    setStarting(true)
    setFailure(null)
    try {
      const media = await openCamera()
      if (ticket !== wanted.current) {
        closeCamera(media)
        return
      }
      stream.current = media
      if (video.current) {
        video.current.srcObject = media
        await video.current.play().catch(() => {
        })
      }
    } catch (error) {
      if (ticket !== wanted.current) return
      setFailure(
        error instanceof CameraFailure ? error.message : cameraMessage('UNKNOWN'),
      )
    } finally {
      if (ticket === wanted.current) setStarting(false)
    }
  }, [])

  useEffect(() => {
    if (!shot) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(shot.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [shot])

  useEffect(() => {
    if (shot) {
      stop()
      return
    }
    void start()
    return stop
  }, [shot, start, stop])

  async function take() {
    if (!video.current || working) return
    setWorking(true)
    setRefused(null)
    try {
      const capture = await captureFrame(video.current, {
        place,
        takenAt: new Date().toISOString(),
        position,
      })
      onShot({ blob: capture.blob })
    } catch (error) {
      setRefused(
        error instanceof TooBlurry
          ? error.message
          : error instanceof Error
            ? error.message
            : 'The photo could not be taken. Try again.',
      )
    } finally {
      setWorking(false)
    }
  }

  function retake() {
    setRefused(null)
    onShot(null)
  }

  if (shot) {
    return (
      <div className={cn('overflow-hidden rounded-card bg-surface', className)}>
        {preview ? (
          <img src={preview} alt="The photo you just took" className="w-full object-cover" />
        ) : (
          <div className="aspect-[4/3] w-full" />
        )}
        <Button variant="surface" size="lg" className="rounded-none border-0" onClick={retake}>
          <RefreshCw size={18} />
          Take it again
        </Button>
      </div>
    )
  }

  if (failure) {
    return (
      <div className={cn('rounded-card bg-surface px-4 py-5', className)}>
        <p className="text-subhead leading-snug text-ink">{failure}</p>
        <Button variant="secondary" size="md" className="mt-4 w-full" onClick={() => void start()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-card bg-black', className)}>
      <div className="relative aspect-[4/3] w-full">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="size-full object-cover"
          disablePictureInPicture
        />

        {starting ? (
          <p className="absolute inset-0 grid place-items-center text-callout text-white/80">
            Starting the camera…
          </p>
        ) : null}

        {refused ? (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 rounded-lg bg-failed px-3 py-2 text-footnote leading-snug text-on-strong"
          >
            {refused}
          </p>
        ) : null}
      </div>

      <Button
        size="lg"
        className="rounded-none"
        onClick={take}
        disabled={starting || working}
        data-testid="take-photo"
      >
        <Camera size={18} />
        {working ? 'Checking…' : 'Take the photo'}
      </Button>
    </div>
  )
}
