import { describe, it, expect } from 'vitest'
import { mapRoleInput } from '@/lib/access/roles'

describe('mapRoleInput', () => {
  it("maps 'Member' → 'viewer'", () => {
    expect(mapRoleInput('Member')).toBe('viewer')
  })
  it("maps 'Co-admin' → 'admin'", () => {
    expect(mapRoleInput('Co-admin')).toBe('admin')
  })
  it('passes an unknown value through unchanged (RPC then validates it)', () => {
    expect(mapRoleInput('viewer')).toBe('viewer')
  })
})
