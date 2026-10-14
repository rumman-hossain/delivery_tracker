import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92svh] w-full max-w-lg flex-col',
            'rounded-t-sheet bg-paper shadow-[0_-1px_0_var(--color-hairline)]',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
            'duration-250',
          )}
        >
          <header className="relative shrink-0 px-4 pb-3 pt-3">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-hairline" aria-hidden />
            <Dialog.Title className="pr-10 text-[20px] font-bold tracking-[-0.01em] text-ink">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 pr-10 text-callout text-ink-2">
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
            <Dialog.Close
              aria-label="Close"
              className="absolute right-3 top-6 grid size-8 place-items-center rounded-full bg-hairline/60 text-ink-2"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{children}</div>

          {footer ? (
            <div className="safe-bottom shrink-0 border-t border-hairline bg-surface px-4 pb-3 pt-3">
              {footer}
            </div>
          ) : (
            <div className="safe-bottom shrink-0" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
