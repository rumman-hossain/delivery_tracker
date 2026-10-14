import * as z from 'zod'

/** Three roles, two tiers. */
export const zRole = z.enum(['superadmin', 'admin', 'driver'])
export const zStopType = z.enum(['shop', 'home'])

/** The kinds of place a route can call at. */
export const zLocationKind = z.enum(['shop', 'warehouse', 'home'])
export const zTripStatus = z.enum(['assigned', 'in_progress', 'completed'])
export const zEventType = z.enum(['START', 'REACHED', 'COMPLETE', 'CORRECTION', 'ROUTE_CHANGED'])
export const zMatch = z.enum(['matched', 'suspect', 'na'])
export const zDelivery = z.enum(['delivered', 'partial', 'failed'])

export const zUser = z.object({
  uid: z.string(),
  role: zRole,
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  photoPath: z.string().optional(),
  active: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
})

export const zShop = z.object({
  id: z.string(),
  kind: zLocationKind.optional(),
  name: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  address: z.string().optional(),
  radiusM: z.number().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
})

/** Where a route begins or ends: a registered place, copied. */
export const zRoutePoint = z.object({
  placeId: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
})

export const zStop = z.object({
  seq: z.number().int().positive(),
  type: zStopType,
  shopId: z.string().optional(),
  label: z.string().optional(),
})

export const zRoute = z.object({
  id: z.string(),
  name: z.string(),
  start: zRoutePoint,
  end: zRoutePoint,
  stops: z.array(zStop),
  active: z.boolean(),
  createdAt: z.string(),
})

/** Frozen at assign time. */
export const zSnapshotStop = z.object({
  seq: z.number().int().positive(),
  type: zStopType,
  shopId: z.string().optional(),
  shopKind: zLocationKind.optional(),
  shopName: z.string().optional(),
  label: z.string().optional(),
  expectedLat: z.number().optional(),
  expectedLng: z.number().optional(),
  expectedRadiusM: z.number().optional(),
})

export const zRouteSnapshot = z.object({
  start: zRoutePoint,
  end: zRoutePoint,
  stops: z.array(zSnapshotStop),
})

export const zTrip = z.object({
  id: z.string(),
  routeId: z.string(),
  driverUid: z.string(),
  driverName: z.string(),
  assignedDate: z.string(),
  status: zTripStatus,
  currentStopSeq: z.number().int(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  routeSnapshot: zRouteSnapshot,
  routeVersion: z.number().int().default(0),
})

export const zEvent = z.object({
  id: z.string(),
  type: zEventType,
  seq: z.number().int().optional(),
  serverTime: z.string(),
  clientTime: z.string().optional(),
  timeSkewMs: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracyM: z.number().optional(),
  sampleCount: z.number().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  distanceM: z.number().nullable().optional(),
  matchStatus: zMatch.optional(),
  deliveryStatus: zDelivery.optional(),
  photoPath: z.string().optional(),
  note: z.string().optional(),
  byRole: z.string().optional(),
  targetEventId: z.string().optional(),
  changes: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
})

export const zBaseCapture = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracyM: z.number().optional(),
  clientTime: z.string(),
})

export const zReachedReq = z.object({
  seq: z.number().int().positive(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracyM: z.number().optional(),
  sampleCount: z.number().int().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  clientTime: z.string(),
  deliveryStatus: zDelivery,
  photoPath: z.string().min(1).optional(),
  note: z.string().max(280).optional(),
})

/** A phone number as people write it. */
export const zPhone = z
  .string()
  .trim()
  .max(32, 'That is too long for a phone number.')
  .refine((v) => !/[^0-9+\-() .]/.test(v), 'Use only digits and + - ( ) . and spaces.')
  .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 8, 'That is too short to be a phone number.')

export const zCreateUserReq = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: zPhone,
  tempPassword: z.string().min(8),
  role: zRole,
})

export const zShopReq = z.object({
  kind: zLocationKind.optional(),
  name: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  address: z.string().optional(),
  radiusM: z.number().int().min(10).max(1000).nullable().optional(),
  active: z.boolean().optional(),
})

export const zRouteReq = z.object({
  name: z.string().min(1).optional(),
  startPlaceId: z.string().min(1).optional(),
  endPlaceId: z.string().min(1).optional(),
  stops: z.array(zStop).optional(),
  active: z.boolean().optional(),
})

export const zConfigReq = z.object({ matchRadiusM: z.number().int().min(10).max(1000) })

/** Replacing the stops a driver has not reached yet. */
export const zEditTripStopsReq = z.object({
  stops: z.array(zStop),
  fromStopSeq: z.number().int().positive(),
  routeVersion: z.number().int().nonnegative(),
  reason: z.string().min(1, 'Say why the route is changing'),
})

/** An admin edit to a recorded event. */
export const zCorrectionReq = z.object({
  targetEventId: z.string().min(1),
  changes: z
    .object({
      distanceM: z.number().nullable().optional(),
      matchStatus: zMatch.optional(),
      deliveryStatus: zDelivery.optional(),
    })
    .refine((c) => Object.keys(c).length > 0, 'change at least one value'),
  reason: z.string().min(1, 'say why this is being corrected'),
})

export const zConfig = z.object({ matchRadiusM: z.number() })
export const zReachedResp = z.object({
  eventId: z.string(),
  seq: z.number().int(),
  serverTime: z.string(),
  distanceM: z.number().nullable(),
  matchStatus: zMatch,
  nextSeq: z.number().int(),
  tripStatus: zTripStatus,
})

/** What an operator said when they last changed this trip's route. */
export const zRouteNote = z.object({
  reason: z.string(),
  at: z.string(),
  byRole: zRole.optional(),
})

export const zNextStop = z.object({
  done: z.boolean().optional(),
  seq: z.number().int().optional(),
  type: zStopType.optional(),
  shopName: z.string().optional(),
  label: z.string().optional(),
  expectedLat: z.number().optional(),
  expectedLng: z.number().optional(),
  expectedRadiusM: z.number().optional(),
  note: zRouteNote.optional(),
})

export const zPhotoURLResp = z.object({
  uploadURL: z.string(),
  photoPath: z.string(),
  expiresAt: z.string(),
})

export const zStartResp = z.object({ tripStatus: zTripStatus, nextSeq: z.number().int() })
export const zCompleteResp = z.object({ tripStatus: zTripStatus })
export const zOk = z.object({ ok: z.boolean() })

export const zListShops = z.object({ shops: z.array(zShop) })
export const zListRoutes = z.object({ routes: z.array(zRoute) })
export const zGetRoute = z.object({ route: zRoute })
export const zListUsers = z.object({ users: z.array(zUser) })
/** The backend caps this list and says so. */
export const zListTrips = z.object({
  trips: z.array(zTrip),
  truncated: z.boolean().optional(),
  limit: z.number().int().optional(),
})
export const zGetTrip = z.object({
  trip: zTrip,
  events: z.array(zEvent),
  photos: z.record(z.string(), z.string()),
  canAct: z.boolean().nullish(),
})
export const zCreatedShop = z.object({ shopId: z.string() })
export const zCreatedRoute = z.object({ routeId: z.string() })
export const zCreatedTrip = z.object({ tripId: z.string() })
export const zCreatedUser = z.object({ uid: z.string() })
export const zCreatedEvent = z.object({ eventId: z.string() })
export const zEditedTrip = z.object({ trip: zTrip })
export const zMe = z.object({
  uid: z.string(),
  name: z.string(),
  role: zRole,
  phone: z.string().optional(),
  dispatch: z.object({ name: z.string(), phone: z.string() }).optional(),
})

export const zAssignTripReq = z.object({
  routeId: z.string().min(1),
  driverUid: z.string().min(1),
  assignedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use a YYYY-MM-DD date'),
})

export type Role = z.infer<typeof zRole>
export type LocationKind = z.infer<typeof zLocationKind>
export type Shop = z.infer<typeof zShop>
export type Stop = z.infer<typeof zStop>
export type Route = z.infer<typeof zRoute>
export type SnapshotStop = z.infer<typeof zSnapshotStop>
export type Trip = z.infer<typeof zTrip>
export type TripEvent = z.infer<typeof zEvent>
export type User = z.infer<typeof zUser>
export type ReachedReq = z.infer<typeof zReachedReq>
export type NextStop = z.infer<typeof zNextStop>
export type RouteNote = z.infer<typeof zRouteNote>
export type Delivery = z.infer<typeof zDelivery>
export type Match = z.infer<typeof zMatch>
export type TripStatus = z.infer<typeof zTripStatus>
