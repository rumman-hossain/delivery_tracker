import { authedFetch } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

export const listShops = () => authedFetch('/admin/shops', s.zListShops).then((r) => r.shops)

export const createShop = (body: z.infer<typeof s.zShopReq>) =>
  authedFetch('/admin/shops', s.zCreatedShop, { method: 'POST', body })

export const updateShop = (id: string, body: z.infer<typeof s.zShopReq>) =>
  authedFetch(`/admin/shops/${id}`, s.zOk, { method: 'PATCH', body })
