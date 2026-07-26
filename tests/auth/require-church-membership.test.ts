import { describe, expect, it } from 'vitest'
import { churchMembershipDecision } from '@/lib/auth/require-church-membership'

describe('churchMembershipDecision', () => {
  it('church hidden + unauthenticated + signInNext → redirect-signin', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: false,
        hasMembership: false,
        signInNext: '/app/c/answer/1',
      }),
    ).toEqual({ action: 'redirect-signin' })
  })

  it('church hidden + unauthenticated + no signInNext → not-found (the /done path)', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: false,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church hidden + authenticated non-member + signInNext → not-found (authed still 404s)', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: '/app/c/answer/1',
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church hidden + authenticated + no signInNext → not-found', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church visible + no membership → not-found', () => {
    expect(
      churchMembershipDecision({
        churchExists: true,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church visible + membership → ok', () => {
    expect(
      churchMembershipDecision({
        churchExists: true,
        isAuthenticated: true,
        hasMembership: true,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'ok' })
  })
})
