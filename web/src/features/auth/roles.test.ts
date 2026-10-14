import { describe, expect, it } from 'vitest'

import { homeFor } from '@/features/auth/RequireRole'
import { zRole, type Role } from '@/lib/schemas'

describe('homeFor', () => {
  it('sends both operator tiers to the admin area', () => {
    expect(homeFor('superadmin')).toBe('/admin/trips')
    expect(homeFor('admin')).toBe('/admin/trips')
  })

  it('sends a driver to their own trips', () => {
    expect(homeFor('driver')).toBe('/driver')
  })

  it('has a home for every role the contract allows', () => {
    for (const role of zRole.options) {
      expect(homeFor(role satisfies Role), `no home for ${role}`).toMatch(/^\//)
    }
  })
})

describe('zRole', () => {
  it('accepts the three roles and nothing else', () => {
    expect(zRole.safeParse('superadmin').success).toBe(true)
    expect(zRole.safeParse('admin').success).toBe(true)
    expect(zRole.safeParse('driver').success).toBe(true)
    expect(zRole.safeParse('manager').success).toBe(false)
    expect(zRole.safeParse('').success).toBe(false)
    expect(zRole.safeParse(undefined).success).toBe(false)
  })
})
