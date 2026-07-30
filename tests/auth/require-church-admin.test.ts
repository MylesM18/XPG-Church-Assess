import { describe, it, expect } from 'vitest'
import { adminGuardDecision } from '@/lib/auth/require-church-admin'

describe('adminGuardDecision()', () => {
  it('requires sign-in first', () => {
    expect(adminGuardDecision(false, null)).toBe('You must be signed in.')
    expect(adminGuardDecision(false, 'admin')).toBe('You must be signed in.')
  })
  it('requires the admin role for an authenticated caller', () => {
    expect(adminGuardDecision(true, 'viewer')).toBe('You must be an admin of this church.')
    expect(adminGuardDecision(true, null)).toBe('You must be an admin of this church.')
  })
  it('lets an authenticated admin proceed', () => {
    expect(adminGuardDecision(true, 'admin')).toBeNull()
  })
})
