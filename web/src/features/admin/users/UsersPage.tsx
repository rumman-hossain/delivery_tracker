import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ResetPasswordSheet } from '@/features/admin/users/ResetPasswordSheet'
import { UserEditSheet } from '@/features/admin/users/UserEditSheet'
import { UserFormSheet } from '@/features/admin/users/UserFormSheet'
import { useAuth } from '@/features/auth/AuthProvider'
import { DataState, Empty } from '@/components/feedback/DataState'
import { Screen } from '@/components/layout/Screen'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { ListSection } from '@/components/ui/list'
import { useUpdateUser, useUsers } from '@/features/admin/users/hooks'
import { ran } from '@/lib/query/mutations'
import type { Role, User } from '@/lib/schemas'
import { UserRow } from '@/features/admin/users/UserRow'

const GROUPS: { role: Role; title: string; blurb: string }[] = [
  { role: 'superadmin', title: 'Superadmins', blurb: 'See and manage every account.' },
  { role: 'admin', title: 'Admins', blurb: 'Manage the drivers they create.' },
  { role: 'driver', title: 'Drivers', blurb: 'Run routes and record stops.' },
]

export function UsersPage() {
  const { role: myRole, user: me } = useAuth()
  const isSuperadmin = myRole === 'superadmin'

  const users = useUsers(isSuperadmin ? undefined : 'driver')
  const update = useUpdateUser()

  const [adding, setAdding] = useState<'admin' | 'driver' | null>(null)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [toToggle, setToToggle] = useState<User | null>(null)

  return (
    <Screen
      title={isSuperadmin ? 'Users' : 'Drivers'}
      subtitle={
        isSuperadmin
          ? 'Every account on the system.'
          : 'The drivers you added. Other admins keep their own.'
      }
      trailing={
        isSuperadmin ? null : (
          <Button variant="plain" size="icon" onClick={() => setAdding('driver')} aria-label="Add driver">
            <Plus size={24} strokeWidth={2.4} />
          </Button>
        )
      }
    >
      {isSuperadmin ? (
        <div className="mb-6 flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" onClick={() => setAdding('admin')}>
            <Plus size={17} /> Admin
          </Button>
          <Button variant="secondary" size="md" className="flex-1" onClick={() => setAdding('driver')}>
            <Plus size={17} /> Driver
          </Button>
        </div>
      ) : null}

      <DataState
        query={users}
        empty={
          <Empty
            title={isSuperadmin ? 'No accounts yet' : 'No drivers yet'}
            body={
              isSuperadmin
                ? 'Add an admin to run a depot, or a driver to run routes.'
                : 'Add a driver, then assign them a route for a date.'
            }
            action={
              <Button size="md" onClick={() => setAdding('driver')}>
                Add driver
              </Button>
            }
          />
        }
      >
        {(list) =>
          isSuperadmin ? (
            <>
              {GROUPS.map((g) => {
                const inGroup = list.filter((u) => u.role === g.role)
                if (inGroup.length === 0) return null
                return (
                  <ListSection key={g.role} title={g.title} footer={g.blurb}>
                    {inGroup.map((u) => (
                      <UserRow
                        key={u.uid}
                        user={u}
                        isMe={u.uid === me?.uid}
                        onEdit={setEditing}
                        onReset={setResetting}
                        onToggle={setToToggle}
                      />
                    ))}
                  </ListSection>
                )
              })}
            </>
          ) : (
            <ListSection>
              {list.map((u) => (
                <UserRow
                  key={u.uid}
                  user={u}
                  isMe={u.uid === me?.uid}
                  onEdit={setEditing}
                  onReset={setResetting}
                  onToggle={setToToggle}
                />
              ))}
            </ListSection>
          )
        }
      </DataState>

      <UserFormSheet
        open={adding !== null}
        role={adding ?? 'driver'}
        canChooseRole={isSuperadmin}
        onOpenChange={(v) => !v && setAdding(null)}
      />

      <UserEditSheet user={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />
      <ResetPasswordSheet user={resetting} onOpenChange={(v) => !v && setResetting(null)} />

      <ConfirmDialog
        open={!!toToggle}
        onOpenChange={(v) => !v && setToToggle(null)}
        title={toToggle?.active ? `Deactivate ${toToggle.name}?` : `Reactivate ${toToggle?.name}?`}
        body={
          toToggle?.active
            ? 'They are signed out and cannot sign in again until you turn the account back on. Work already recorded is kept.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={toToggle?.active ? 'Deactivate' : 'Reactivate'}
        destructive={toToggle?.active}
        pending={update.isPending}
        onConfirm={async () => {
          if (!toToggle) return
          const ok = await ran(() =>
            update.mutateAsync({ uid: toToggle.uid, body: { active: !toToggle.active } }),
          )
          if (ok) setToToggle(null)
        }}
      />
    </Screen>
  )
}
