import { authedFetch } from '@/lib/api/client'
import type { z } from 'zod'
import * as s from '@/lib/schemas'

export const listRoutes = () => authedFetch('/admin/routes', s.zListRoutes).then((r) => r.routes)

export const getRoute = (id: string) =>
  authedFetch(`/admin/routes/${id}`, s.zGetRoute).then((r) => r.route)

export const createRoute = (body: z.infer<typeof s.zRouteReq>) =>
  authedFetch('/admin/routes', s.zCreatedRoute, { method: 'POST', body })

export const updateRoute = (id: string, body: z.infer<typeof s.zRouteReq>) =>
  authedFetch(`/admin/routes/${id}`, s.zOk, { method: 'PATCH', body })
