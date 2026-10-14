import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { auth } from '@/lib/firebase/firebase'
import { queryClient } from '@/lib/query/queryClient'
import { zRole, type Role } from '@/lib/schemas'

type AuthValue = {
  user: User | null
  role: Role | null
  loading: boolean
  claimFailed: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function roleFrom(claims: Record<string, unknown>): Role | null {
  const parsed = zRole.safeParse(claims.role)
  return parsed.success ? parsed.data : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimFailed, setClaimFailed] = useState(false)

  useEffect(() => {
    let generation = 0

    return onAuthStateChanged(auth, async (next) => {
      const mine = ++generation
      setUser(next)

      if (!next) {
        setRole(null)
        setClaimFailed(false)
        setLoading(false)
        return
      }

      let claimed: Role | null = null
      let failed = false
      try {
        claimed = roleFrom((await next.getIdTokenResult()).claims)

        if (!claimed) {
          claimed = roleFrom((await next.getIdTokenResult(true)).claims)
        }
      } catch (error) {
        console.warn('could not resolve the role claim:', error)
        claimed = null
        failed = true
      }

      if (mine !== generation) return

      setRole(claimed)
      setClaimFailed(failed)
      setLoading(false)
    })
  }, [])

  const signOut = useCallback(async () => {
    await fbSignOut(auth)
    queryClient.clear()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, role, loading, claimFailed, signOut }),
    [user, role, loading, claimFailed, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
