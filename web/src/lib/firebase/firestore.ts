import { getFirestore } from 'firebase/firestore'

import { firebaseApp } from '@/lib/firebase/firebase'

/** Read-only live views, for the admin only. */
export const db = getFirestore(firebaseApp)
