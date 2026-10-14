import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none ' +
    'transition-[transform,opacity,background-color] duration-100 active:scale-[0.97] ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
    'disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-strong',
        secondary: 'bg-accent-soft text-accent',
        surface: 'bg-surface text-ink border border-hairline',
        plain: 'text-accent',
        destructive: 'bg-failed text-on-strong',
      },
      size: {
        lg: 'tap-target w-full text-headline px-5',
        md: 'min-h-11 px-4 text-body',
        sm: 'min-h-9 px-3 text-subhead',
        icon: 'size-11 rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type Props = ComponentProps<'button'> &
  VariantProps<typeof button> & { asChild?: boolean; pending?: boolean; pendingLabel?: string }

/** `type="button"` by default. While `pending`, it is disabled and shows `pendingLabel`. */
export function Button({ className, variant, size, asChild, type, pending, pendingLabel, disabled, children, ...props }: Props) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(button({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      disabled={disabled || pending}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Comp>
  )
}
