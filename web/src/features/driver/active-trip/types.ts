import { type Fix } from '@/lib/gps'

export type GpsState =
  | {
      kind: 'capturing'
      sampleCount: number
      bestAccuracyM: number | null
      attempt: number
      attempts: number
    }
  | { kind: 'ready'; fix: Fix }
  | { kind: 'error'; message: string }

export type UploadState =
  | { kind: 'none' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'done'; path: string }
  | { kind: 'failed'; message: string }
