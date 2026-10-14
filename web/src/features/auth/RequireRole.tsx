import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'

import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import type { Role } from '@/lib/schemas'

const HOME: Record<Role, string> = {
  superadmin: '/admin/trips',
  admin: '/admin/trips',
  driver: '/driver',
}

export const homeFor = (role: Role) => HOME[role]

/** The gate. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, role: actual, loading, claimFailed } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (claimFailed) return <ClaimUnavailable />
  if (!actual) return <NoRole />
  if (!roles.includes(actual)) return <Navigate to={homeFor(actual)} replace />

  return <>{children}</>
}

export function Splash() {
  return (
    <div className="grid h-full place-items-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <div className="size-7 animate-spin rounded-full border-[3px] border-hairline border-t-[var(--accent)]" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  )
}

function ClaimUnavailable() {
  const { signOut, user } = useAuth()
  return (
    <div className="grid h-full place-items-center bg-paper px-6 text-center">
      <div className="max-w-[34ch]">
        <h1 className="text-title font-bold text-ink">Could not check your access</h1>
        <p className="mt-2 text-subhead leading-snug text-ink-2">
          {user?.email} is signed in, but we could not reach the service to confirm what
          this account can do. Check your connection and try again.
        </p>
        <Button size="md" className="mt-6" onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Button variant="plain" size="md" className="mt-2" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

function NoRole() {
  const { signOut, user } = useAuth()
  return (
    <div className="grid h-full place-items-center bg-paper px-6 text-center">
      <div className="max-w-[34ch]">
        <h1 className="text-title font-bold text-ink">This account has no access yet</h1>
        <p className="mt-2 text-subhead leading-snug text-ink-2">
          {user?.email} is signed in, but no role has been set on it. Ask your administrator
          to finish setting up the account.
        </p>
        <Button variant="secondary" size="md" className="mt-6" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
