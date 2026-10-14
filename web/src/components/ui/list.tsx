import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Heading above a grouped section. */
export function SectionTitle({ as: Tag = 'h2', className, ...props }: ComponentProps<'h2'> & { as?: 'h2' | 'h3' }) {
  return <Tag className={cn('mb-2 px-1 text-footnote font-semibold text-ink-2', className)} {...props} />
}

/** Rounded surface that groups rows or fields. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('overflow-hidden rounded-card bg-surface', className)} {...props} />
}

export function ListSection({
  title,
  footer,
  children,
  className,
}: {
  title?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-7', className)}>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      <Card>{children}</Card>
      {footer ? <p className="mt-2 px-1 text-footnote leading-snug text-ink-3">{footer}</p> : null}
    </section>
  )
}

/** A row of a grouped list. */
export function ListRow({
  className,
  interactive,
  ...props
}: ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-row items-center gap-3 px-4 py-2.5',
        'border-b border-hairline last:border-b-0',
        interactive && 'active:bg-paper',
        className,
      )}
      {...props}
    />
  )
}

/** Label on the left, value on the right, both on one baseline. */
export function ListValueRow({
  label,
  value,
  hint,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
}) {
  return (
    <ListRow>
      <div className="min-w-0 flex-1">
        <div className="text-body text-ink">{label}</div>
        {hint ? <div className="mt-0.5 text-footnote text-ink-3">{hint}</div> : null}
      </div>
      <div className="tnum shrink-0 text-body text-ink-2">{value}</div>
    </ListRow>
  )
}
