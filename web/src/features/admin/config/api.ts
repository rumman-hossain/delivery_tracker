import { authedFetch } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

export const getConfig = () => authedFetch('/admin/config', s.zConfig)

export const updateConfig = (body: z.infer<typeof s.zConfigReq>) =>
  authedFetch('/admin/config', s.zOk, { method: 'PATCH', body })
