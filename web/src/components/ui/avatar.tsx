import { ProofPhoto } from '@/components/photo/ProofPhoto'
import { userPhotoPath } from '@/features/admin/users/api'
import type { User } from '@/lib/schemas'

export function Avatar({ user }: { user: User }) {
  const initials = (
    <span
      aria-hidden
      className="grid size-full place-items-center rounded-full bg-paper text-subhead font-semibold text-ink-3"
    >
      {user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')}
    </span>
  )

  if (!user.photoPath) {
    return <span className="size-10 shrink-0">{initials}</span>
  }

  return (
    <ProofPhoto
      path={userPhotoPath(user.uid)}
      alt=""
      className="size-10 shrink-0 overflow-hidden rounded-full object-cover"
      fallback={initials}
    />
  )
}
