import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isAlreadyRegistered,
  mintSignInToken,
  provisionInvitedAccount,
  settleInvitations,
  toVerifyType,
} from '@/lib/auth/invited-account'

// The admin-API half of "invite = account creation". These run against a mocked client: the
// contract (GoTrue /admin/generate_link) was verified against the Supabase auth docs on
// 2026-09-14 — `invite` creates a user or reuses an unconfirmed one and answers 422
// email_exists for a confirmed one; `magiclink` works for any existing user and is silently
// converted to `signup` for an unknown one.
function adminWith(generateLink: ReturnType<typeof vi.fn>) {
  return { auth: { admin: { generateLink } } } as unknown as SupabaseClient
}

describe('isAlreadyRegistered', () => {
  it('recognises the codes GoTrue uses for a confirmed, existing address', () => {
    expect(isAlreadyRegistered({ code: 'email_exists', message: 'x' })).toBe(true)
    expect(isAlreadyRegistered({ code: 'user_already_exists', message: 'x' })).toBe(true)
    expect(isAlreadyRegistered({ message: 'A user with this email address has already been registered' })).toBe(true)
  })

  it('is false for anything else, including no error', () => {
    expect(isAlreadyRegistered(null)).toBe(false)
    expect(isAlreadyRegistered({ code: 'over_email_send_rate_limit', message: 'rate' })).toBe(false)
  })
})

describe('provisionInvitedAccount', () => {
  it('generates an invite link carrying the invited flag Supabase templates read', async () => {
    const generateLink = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await provisionInvitedAccount(adminWith(generateLink), { email: 'Leader@Church.org' })
    expect(res).toEqual({ ok: true, existed: false })
    const arg = generateLink.mock.calls[0]![0]
    expect(arg.type).toBe('invite')
    expect(arg.email).toBe('Leader@Church.org')
    expect(arg.options.data).toEqual({ invited: true })
  })

  it('treats an already-registered address as success — the account exists to bind', async () => {
    const generateLink = vi.fn().mockResolvedValue({
      data: { user: null }, error: { code: 'email_exists', message: 'already registered', status: 422 },
    })
    const res = await provisionInvitedAccount(adminWith(generateLink), { email: 'a@b.c' })
    expect(res).toEqual({ ok: true, existed: true })
  })

  it('reports any other failure with its reason', async () => {
    const generateLink = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'boom' } })
    const res = await provisionInvitedAccount(adminWith(generateLink), { email: 'a@b.c' })
    expect(res).toEqual({ ok: false, reason: 'boom' })
  })
})

describe('mintSignInToken', () => {
  it('asks for a magic link and hands back the hashed token with its verification type', async () => {
    const generateLink = vi.fn().mockResolvedValue({
      data: { user: { id: 'u1' }, properties: { hashed_token: 'h4sh', verification_type: 'magiclink' } }, error: null,
    })
    const minted = await mintSignInToken(adminWith(generateLink), 'a@b.c')
    expect(generateLink.mock.calls[0]![0]).toEqual({ type: 'magiclink', email: 'a@b.c' })
    expect(minted).toEqual({ tokenHash: 'h4sh', type: 'magiclink', userId: 'u1' })
  })

  it('returns null on error or a missing token — the caller falls back to the emailed sign-in', async () => {
    expect(await mintSignInToken(adminWith(vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })), 'a@b.c')).toBeNull()
    expect(await mintSignInToken(adminWith(vi.fn().mockResolvedValue({ data: { properties: {} }, error: null })), 'a@b.c')).toBeNull()
  })
})

describe('toVerifyType', () => {
  it('passes through the types verifyOtp accepts and defaults the rest to magiclink', () => {
    expect(toVerifyType('signup')).toBe('signup')
    expect(toVerifyType('magiclink')).toBe('magiclink')
    expect(toVerifyType('invite')).toBe('invite')
    expect(toVerifyType('email_change_current')).toBe('magiclink')
    expect(toVerifyType(undefined)).toBe('magiclink')
  })
})

describe('settleInvitations', () => {
  it('calls the settle RPC and returns the count', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })
    expect(await settleInvitations({ rpc } as unknown as SupabaseClient)).toBe(2)
    expect(rpc).toHaveBeenCalledWith('settle_my_invitations')
  })

  it('never throws — a settle failure must not break a sign-in', async () => {
    expect(await settleInvitations({ rpc: vi.fn().mockRejectedValue(new Error('down')) } as unknown as SupabaseClient)).toBe(0)
    expect(await settleInvitations({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) } as unknown as SupabaseClient)).toBe(0)
  })
})
