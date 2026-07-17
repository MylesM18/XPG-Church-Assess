import { describe, it, expect } from 'vitest'
import { resolveAcceptState, acceptLink, roleLabel, type AcceptPreview } from '@/lib/access/accept-state'

const live: AcceptPreview = { church_name: 'Grace', role: 'viewer', invited_email: 'inv@test.com', status: 'pending', is_expired: false }

describe('resolveAcceptState', () => {
  it('null preview → not_found', () => {
    expect(resolveAcceptState({ preview: null, signedIn: false, sessionEmail: null })).toBe('not_found')
  })
  it('revoked → revoked (even if signed in and matching)', () => {
    expect(resolveAcceptState({ preview: { ...live, status: 'revoked' }, signedIn: true, sessionEmail: 'inv@test.com' })).toBe('revoked')
  })
  it('accepted → accepted', () => {
    expect(resolveAcceptState({ preview: { ...live, status: 'accepted' }, signedIn: true, sessionEmail: 'inv@test.com' })).toBe('accepted')
  })
  it('expired → expired (before the sign-in check)', () => {
    expect(resolveAcceptState({ preview: { ...live, is_expired: true }, signedIn: false, sessionEmail: null })).toBe('expired')
  })
  it('pending & live & signed-out → sign_in', () => {
    expect(resolveAcceptState({ preview: live, signedIn: false, sessionEmail: null })).toBe('sign_in')
  })
  it('signed-in wrong email → wrong_email', () => {
    expect(resolveAcceptState({ preview: live, signedIn: true, sessionEmail: 'other@test.com' })).toBe('wrong_email')
  })
  it('signed-in matching email (case-insensitive) → ready', () => {
    expect(resolveAcceptState({ preview: live, signedIn: true, sessionEmail: 'INV@Test.com' })).toBe('ready')
  })
})

describe('helpers', () => {
  it('acceptLink builds the URL', () => {
    expect(acceptLink('http://127.0.0.1:3000', 'abc')).toBe('http://127.0.0.1:3000/accept/abc')
  })
  it('roleLabel maps admin→co-admin, viewer→viewer', () => {
    expect(roleLabel('admin')).toBe('co-admin')
    expect(roleLabel('viewer')).toBe('viewer')
  })
})
