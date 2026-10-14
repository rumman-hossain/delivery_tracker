import { authedFetch } from '@/lib/api/client'
import * as s from '@/lib/schemas'

export const getMe = () => authedFetch('/me', s.zMe)
