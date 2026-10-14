import { ChevronRight, KeyRound, SquarePen } from 'lucide-react'
import { Link } from 'react-router'
import { Pill } from '@/components/trip/StatusPill'
import { ListRow } from '@/components/ui/list'
import type { User } from '@/lib/schemas'
import { Avatar } from '@/components/ui/avatar'

export function UserRow({
  user,
  isMe,
  onEdit,
  onReset,
  onToggle,
}: {
  user: User
  isMe: boolean
  onEdit: (u: User) => void
  onReset: (u: User) => void
  onToggle: (u: User) => void
}) {
  const isDriver = user.role === 'driver'

  return (
    <ListRow className="flex-wrap gap-y-0 p-0">
      {isDriver ? (
        <Link
          to={`/admin/drivers/${user.uid}/history`}
          className="flex min-h-row-lg min-w-0 flex-1 items-center gap-2 py-2.5 pl-4"
        >
          <Avatar user={user} />
          <Identity user={user} isMe={isMe} />
          <ChevronRight size={18} className="shrink-0 text-ink-3" />
        </Link>
      ) : (
        <div className="flex min-h-row-lg min-w-0 flex-1 items-center gap-2 py-2.5 pl-4">
          <Avatar user={user} />
          <Identity user={user} isMe={isMe} />
        </div>
      )}

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onEdit(user)}
          aria-label={`Edit ${user.name}`}
          className="grid min-h-row-lg w-11 place-items-center text-accent"
        >
          <SquarePen size={18} />
        </button>
        <button
          type="button"
          onClick={() => onReset(user)}
          disabled={isMe}
          aria-label={`Reset ${user.name}'s password`}
          className="grid min-h-row-lg w-11 place-items-center text-accent disabled:opacity-30"
        >
          <KeyRound size={18} />
        </button>
        <button
          type="button"
          onClick={() => onToggle(user)}
          disabled={isMe && user.active}
          className="min-h-row-lg px-4 text-subhead font-semibold text-accent disabled:opacity-30"
        >
          {user.active ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </ListRow>
  )
}

export function Identity({ user, isMe }: { user: User; isMe: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 truncate text-body font-medium text-ink">
        <span className="truncate">{user.name}</span>
        {isMe ? <Pill tone="accent">You</Pill> : null}
        {!user.active ? <Pill>Off</Pill> : null}
      </p>
      <p className="truncate text-footnote text-ink-3">{user.email}</p>
      {user.phone ? (
        <a
          href={`tel:${user.phone.replace(/[^\d+]/g, '')}`}
          onClick={(e) => e.stopPropagation()}
          className="tnum mt-0.5 inline-block text-footnote text-accent"
        >
          {user.phone}
        </a>
      ) : null}
    </div>
  )
}
