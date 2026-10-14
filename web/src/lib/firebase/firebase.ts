import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

import { env } from '@/config/env'

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(firebaseApp)
