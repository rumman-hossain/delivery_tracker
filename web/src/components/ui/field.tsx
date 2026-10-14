import * as LabelPrimitive from '@radix-ui/react-label'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/utils'

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="border-b border-hairline last:border-b-0">
      <div className="flex min-h-row items-center gap-3 px-4 py-2">
        <LabelPrimitive.Root
          htmlFor={htmlFor}
          className="w-[38%] shrink-0 text-body text-ink-2"
        >
          {label}
        </LabelPrimitive.Root>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-footnote text-failed">
          {error}
        </p>
      ) : hint ? (
        <p className="px-4 pb-2 text-footnote text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const controlClass =
  'w-full bg-transparent text-body text-ink placeholder:text-ink-3 outline-none ' +
  'disabled:opacity-40'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={3} className={cn(controlClass, 'resize-none py-1', className)} {...props} />
}

/** A native `<select>` on purpose: iOS renders it as the system picker wheel and Android as its own sheet. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(controlClass, 'appearance-none truncate pr-5 text-right', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%237b8694'><path d='M4.5 6.5 8 10l3.5-3.5'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right center',
        backgroundSize: '16px',
      }}
      {...props}
    />
  )
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'ml-auto flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full p-0.5 ' +
          'transition-colors duration-200 data-[state=checked]:bg-matched ' +
          'data-[state=unchecked]:bg-hairline ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={
          'pointer-events-none block size-[27px] rounded-full bg-white shadow-sm ' +
          'transition-transform duration-200 data-[state=checked]:translate-x-5'
        }
      />
    </SwitchPrimitive.Root>
  )
}

/** Label plus switch on one row — the commonest form row in the admin area. */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="border-b border-hairline last:border-b-0">
      <div className="flex min-h-row items-center gap-3 px-4 py-2">
        <LabelPrimitive.Root htmlFor={id} className="flex-1 text-body text-ink">
          {label}
        </LabelPrimitive.Root>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {hint ? <p className="px-4 pb-2 text-footnote text-ink-3">{hint}</p> : null}
    </div>
  )
}

/** The segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string; tone?: 'matched' | 'suspect' | 'failed' }[]
  value: T | null
  onChange: (v: T) => void
  name: string
}) {
  const tones = {
    matched: 'bg-matched text-on-strong',
    suspect: 'bg-suspect text-on-strong',
    failed: 'bg-failed text-on-strong',
  } as const

  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1 rounded-xl bg-paper p-1">
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-12 flex-1 rounded-[9px] text-subhead font-semibold transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              selected ? tones[o.tone ?? 'matched'] : 'text-ink-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
