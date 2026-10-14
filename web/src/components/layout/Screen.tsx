import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { env } from '@/config/env'
import { cn } from '@/lib/utils'

export function Screen({
  title,
  subtitle,
  back,
  trailing,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: ReactNode
  back?: { to: string; label: string }
  trailing?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      threshold: 1,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    document.title = `${title} · ${env.VITE_APP_NAME}`
  }, [title])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={cn(
          'safe-top sticky top-0 z-30 shrink-0 bg-paper/85 backdrop-blur-xl transition-shadow duration-200',
          collapsed && 'shadow-[0_0.5px_0_var(--color-hairline)]',
        )}
      >
        <div className="flex h-11 items-center gap-1 px-2">
          {back ? (
            <Link
              to={back.to}
              className="-ml-1 flex min-h-11 items-center gap-0.5 pr-2 text-headline text-accent"
            >
              <ChevronLeft size={24} strokeWidth={2.5} className="shrink-0" />
              <span className="max-w-[9ch] truncate">{back.label}</span>
            </Link>
          ) : null}

          <h1
            className={cn(
              'pointer-events-none absolute inset-x-0 mx-auto max-w-[60%] truncate text-center',
              'text-headline font-semibold text-ink transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </h1>

          <div className="ml-auto flex items-center gap-1">{trailing}</div>
        </div>
      </header>

      <main className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4', className)}>
        <div className="mx-auto w-full max-w-lg">
          <div className="pb-1 pt-1">
            <h2 className="text-[34px] font-bold leading-[1.1] tracking-[-0.022em] text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-subhead text-ink-2">{subtitle}</p> : null}
          </div>
          <div ref={sentinel} className="h-px" aria-hidden />
          <div className="pb-8 pt-5">{children}</div>
        </div>
      </main>

      {action ? (
        <div className="shrink-0 border-t border-hairline bg-surface/90 px-4 pb-2 pt-3 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-lg">{action}</div>
        </div>
      ) : null}
    </div>
  )
}
