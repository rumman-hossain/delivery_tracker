import { toastError } from '@/lib/query/mutations'
import * as api from '@/features/admin/users/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as photo from '@/lib/photo'
import { qk } from '@/lib/query/queryKeys'
import type { Role } from '@/lib/schemas'

export const useUsers = (role?: Role) =>
  useQuery({ queryKey: qk.users(role), queryFn: () => api.listUsers(role) })

/** Names the role it actually created: a superadmin adds admins through this too. */
export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createUser,
    onSuccess: (_d, body) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(`${roleNoun(body.role)} added`)
    },
    onError: toastError,
  })
}

const ROLE_NOUN: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  driver: 'Driver',
}

const roleNoun = (role: Role) => ROLE_NOUN[role] ?? 'Account'

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { uid: string; body: { name?: string; phone?: string; active?: boolean } }) =>
      api.updateUser(v.uid, v.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Account updated')
    },
    onError: toastError,
  })
}

/** Resets another user's password. */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (v: { uid: string; newPassword: string }) =>
      api.resetUserPassword(v.uid, v.newPassword),
    onSuccess: () => toast.success('Password changed. They have been signed out everywhere.'),
    onError: toastError,
  })
}

/** Uploads a person's photo and forgets the cached copy of the old one. */
export function useUploadUserPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { uid: string; blob: Blob }) => photo.uploadUserPhoto(v.uid, v.blob),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.photo(api.userPhotoPath(v.uid)) })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
