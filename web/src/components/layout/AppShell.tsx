import { ListChecks, Route as RouteIcon, Settings, Store, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router'

import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'

type Tab = { to: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }

const DRIVER_TABS: Tab[] = [
  { to: '/driver', label: 'Trips', icon: ListChecks },
  { to: '/driver/account', label: 'Account', icon: Users },
]

const ADMIN_TABS: Tab[] = [
  { to: '/admin/trips', label: 'Trips', icon: ListChecks },
  { to: '/admin/routes', label: 'Routes', icon: RouteIcon },
  { to: '/admin/shops', label: 'Places', icon: Store },
  { to: '/admin/drivers', label: 'Drivers', icon: Users },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AppShell({ area }: { area: 'admin' | 'driver' }) {
  const { role } = useAuth()
  const tabs = area === 'admin' ? ADMIN_TABS : DRIVER_TABS

  return (
    <div data-role={role ?? area} className="flex h-full min-h-0 flex-col bg-paper">
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>

      <nav
        aria-label={`${area} sections`}
        className="safe-bottom shrink-0 border-t border-hairline bg-surface/85 backdrop-blur-xl"
      >
        <ul className="mx-auto flex w-full max-w-lg">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/driver' || tab.to === '/admin/trips'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[50px] flex-col items-center justify-center gap-0.5 pb-1 pt-1.5',
                    'text-[10px] font-medium transition-colors duration-150',
                    isActive ? 'text-accent' : 'text-ink-3',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon size={23} strokeWidth={isActive ? 2.4 : 1.9} />
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Shown in the Account tab and the admin settings screen. */
export function SignOutRow() {
  const { signOut, user } = useAuth()
  return (
    <button
      type="button"
      onClick={signOut}
      className="flex min-h-row w-full items-center justify-between gap-3 px-4 text-body font-semibold text-failed active:bg-paper"
    >
      <span>Sign out</span>
      {user?.email ? <span className="truncate text-callout font-normal text-ink-3">{user.email}</span> : null}
    </button>
  )
}
