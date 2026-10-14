import { Check } from 'lucide-react'
import type { UploadState } from '@/features/driver/active-trip/types'

export function UploadLine({ state }: { state: UploadState }) {
  if (state.kind === 'uploading') {
    return (
      <>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${Math.round(state.fraction * 100)}%` }}
          />
        </div>
        <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">Sending the photo…</p>
      </>
    )
  }

  if (state.kind === 'done') {
    return (
      <p className="mt-2 flex items-center gap-1.5 px-1 text-footnote leading-snug text-ink-3">
        <Check size={13} className="shrink-0 text-matched" />
        Photo sent. The place and time are written onto it.
      </p>
    )
  }

  if (state.kind === 'failed') {
    return (
      <p className="mt-2 px-1 text-footnote leading-snug text-suspect">
        {state.message} It will be sent again when you record the stop.
      </p>
    )
  }

  return (
    <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">
      Taken here, now. The place and time are written onto the photo.
    </p>
  )
}
