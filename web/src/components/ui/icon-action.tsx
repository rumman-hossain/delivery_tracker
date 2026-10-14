import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Compact icon button used in a segmented toolbar. */
export function IconAction({
  label,
  children,
  onClick,
  disabled,
  destructive,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center border-r border-hairline last:border-r-0',
        'disabled:opacity-25 active:bg-paper',
        destructive ? 'text-failed' : 'text-ink-2',
      )}
    >
      {children}
    </button>
  )
}
