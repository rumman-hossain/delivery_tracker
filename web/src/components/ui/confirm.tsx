import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/list'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: ReactNode
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  destructive?: boolean
  pending?: boolean
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/35 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={cn(
            'safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg p-3',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom duration-200',
          )}
        >
          <Card>
            <div className="px-5 py-4 text-center">
              <AlertDialog.Title className="text-headline font-semibold text-ink">
                {title}
              </AlertDialog.Title>
              {body ? (
                <AlertDialog.Description className="mt-1 text-callout leading-snug text-ink-2">
                  {body}
                </AlertDialog.Description>
              ) : null}
            </div>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? 'destructive' : 'primary'}
                size="lg"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault()
                  void Promise.resolve(onConfirm()).catch(() => {
                  })
                }}
                className="rounded-none"
              >
                {pending ? 'Working…' : confirmLabel}
              </Button>
            </AlertDialog.Action>
          </Card>
          <AlertDialog.Cancel asChild>
            <Button variant="surface" size="lg" className="mt-2 border-0">
              Cancel
            </Button>
          </AlertDialog.Cancel>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
