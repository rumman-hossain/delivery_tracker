import { z } from 'zod'

const csvNumbers = (count: number) =>
  z
    .string()
    .transform((v) => v.split(',').map(Number))
    .refine((v) => v.length === count && v.every(Number.isFinite), `expected ${count} comma-separated numbers`)

const schema = z.object({
  VITE_APP_NAME: z.string().min(1).default('Routekeeper'),
  VITE_API_BASE_URL: z.string().default('').transform((v) => v.replace(/\/$/, '')),
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_TIMEZONE: z.string().default('UTC'),
  VITE_MAP_CENTER: csvNumbers(2).default([0, 20]),
  VITE_MAP_BOUNDS: z.literal("").transform(() => undefined).or(csvNumbers(4)).optional(),
})

const parsed = schema.safeParse(import.meta.env)
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(`Invalid environment (${missing}). Copy web/.env.example to web/.env and fill it in.`)
}

export const env = parsed.data
