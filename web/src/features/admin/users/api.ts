import { authedFetch } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

export const listUsers = (role?: s.Role) =>
  authedFetch(`/admin/users${role ? `?role=${role}` : ''}`, s.zListUsers).then((r) => r.users)

export const createUser = (body: z.infer<typeof s.zCreateUserReq>) =>
  authedFetch('/admin/users', s.zCreatedUser, { method: 'POST', body })

/** The signed PUT for a person's photo, and the confirmation afterwards. */
export const getUserPhotoUploadURL = (uid: string) =>
  authedFetch(`/admin/users/${uid}/photo-url`, s.zPhotoURLResp, { method: 'POST' })

export const confirmUserPhoto = (uid: string) =>
  authedFetch(`/admin/users/${uid}/photo`, s.zOk, { method: 'POST' })

/** The path a person's photo is served from. */
export const userPhotoPath = (uid: string) => `/admin/users/${uid}/photo`

export const updateUser = (uid: string, body: { name?: string; phone?: string; active?: boolean }) =>
  authedFetch(`/admin/users/${uid}`, s.zOk, { method: 'PATCH', body })

/** Sets someone else's password on their behalf, and signs them out everywhere. */
export const resetUserPassword = (uid: string, newPassword: string) =>
  authedFetch(`/admin/users/${uid}/password`, s.zOk, {
    method: 'POST',
    body: { newPassword },
  })
