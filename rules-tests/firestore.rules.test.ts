import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const SUPERADMIN = 'super-1'
const ADMIN = 'admin-1'
const DRIVER = 'driver-1'
const OTHER_DRIVER = 'driver-2'

const rolelessDb = () => env.authenticatedContext('stranger-1', {}).firestore()
const adminDb = () => env.authenticatedContext(ADMIN, { role: 'admin' }).firestore()
const superadminDb = () => env.authenticatedContext(SUPERADMIN, { role: 'superadmin' }).firestore()
const driverDb = () => env.authenticatedContext(DRIVER, { role: 'driver' }).firestore()
const anonDb = () => env.unauthenticatedContext().firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-delivery',
    firestore: {
      rules: readFileSync('../api/firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8086,
    },
  })
})

afterAll(async () => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'shops/shop-a'), { name: 'Shop A', lat: 35.6839, lng: 139.7744 })
    await setDoc(doc(db, 'routes/route-a'), { name: 'Route A' })
    await setDoc(doc(db, 'config/app'), { matchRadiusM: 75 })
    await setDoc(doc(db, `users/${DRIVER}`), { role: 'driver', name: 'Sato' })
    await setDoc(doc(db, 'trips/trip-1'), { driverUid: DRIVER, status: 'in_progress' })
    await setDoc(doc(db, 'trips/trip-1/events/ev-1'), { type: 'REACHED', seq: 1 })
    await setDoc(doc(db, 'trips/trip-2'), { driverUid: OTHER_DRIVER, status: 'assigned' })
  })
})

const read = (db: Firestore, path: string) => getDoc(doc(db, path))

describe('the business catalogue', () => {
  it('is closed to an account with no role', async () => {
    const db = rolelessDb()
    await assertFails(read(db, 'shops/shop-a'))
    await assertFails(read(db, 'routes/route-a'))
    await assertFails(read(db, 'config/app'))
  })

  it('is closed to an anonymous caller', async () => {
    const db = anonDb()
    await assertFails(read(db, 'shops/shop-a'))
    await assertFails(read(db, 'routes/route-a'))
    await assertFails(read(db, 'config/app'))
  })

  it('is closed to a driver', async () => {
    const db = driverDb()
    await assertFails(read(db, 'shops/shop-a'))
    await assertFails(read(db, 'routes/route-a'))
    await assertFails(read(db, 'config/app'))
  })

  it('is open to an admin, which is what the live admin views need', async () => {
    const db = adminDb()
    await assertSucceeds(read(db, 'shops/shop-a'))
    await assertSucceeds(read(db, 'routes/route-a'))
    await assertSucceeds(read(db, 'config/app'))
  })

  it('is open to a superadmin on the same terms', async () => {
    const db = superadminDb()
    await assertSucceeds(read(db, 'shops/shop-a'))
    await assertSucceeds(read(db, 'routes/route-a'))
    await assertSucceeds(read(db, 'config/app'))
  })
})

describe('trips and their events', () => {
  it('are readable by the driver they belong to', async () => {
    const db = driverDb()
    await assertSucceeds(read(db, 'trips/trip-1'))
    await assertSucceeds(read(db, 'trips/trip-1/events/ev-1'))
  })

  it('are not readable by another driver', async () => {
    const db = driverDb()
    await assertFails(read(db, 'trips/trip-2'))
  })

  it('are not readable by an account with no role', async () => {
    await assertFails(read(rolelessDb(), 'trips/trip-1'))
  })

  it('are all readable by a superadmin', async () => {
    const db = superadminDb()
    await assertSucceeds(read(db, 'trips/trip-1'))
    await assertSucceeds(read(db, 'trips/trip-1/events/ev-1'))
  })

  it('are all readable by an admin', async () => {
    const db = adminDb()
    await assertSucceeds(read(db, 'trips/trip-1'))
    await assertSucceeds(read(db, 'trips/trip-2'))
    await assertSucceeds(read(db, 'trips/trip-1/events/ev-1'))
  })
})

describe('user documents', () => {
  it('are readable by their owner even before the role claim propagates', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/fresh-1'), { role: 'driver', name: 'New' })
    })
    const db = env.authenticatedContext('fresh-1', {}).firestore()
    await assertSucceeds(read(db, 'users/fresh-1'))
  })

  it('are not readable by another driver', async () => {
    await assertFails(read(driverDb(), `users/${OTHER_DRIVER}`))
  })

  it('are all readable by an admin', async () => {
    await assertSucceeds(read(adminDb(), `users/${DRIVER}`))
  })

  it('are readable by a superadmin', async () => {
    await assertSucceeds(read(superadminDb(), `users/${DRIVER}`))
  })
})

describe('writes', () => {
  const cases: Array<[string, () => Firestore]> = [
    ['an admin', adminDb],
    ['a driver', driverDb],
    ['an account with no role', rolelessDb],
    ['an anonymous caller', anonDb],
  ]

  for (const [who, db] of cases) {
    it(`are refused for ${who}`, async () => {
      await assertFails(setDoc(doc(db(), 'shops/shop-b'), { name: 'Shop B' }))
      await assertFails(setDoc(doc(db(), 'trips/trip-1'), { status: 'completed' }))
      await assertFails(setDoc(doc(db(), 'trips/trip-1/events/ev-2'), { type: 'REACHED' }))
      await assertFails(setDoc(doc(db(), 'config/app'), { matchRadiusM: 1 }))
    })
  }
})
