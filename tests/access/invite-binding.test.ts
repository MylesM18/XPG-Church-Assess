// Source-reading tripwire (node env, no DOM): sending an invitation now CREATES the invitee's
// account and binds it to the church, in the invite server action, before the email goes out.
// Twelve duplicate churches for one congregation (2026-09-11) came from the membership being
// written only at the end of the invite path; these assertions keep it at the start.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) =>
  fs
    .readFileSync(path.join(ROOT, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const ACTIONS = read('app', 'app', '[churchId]', 'access', 'actions.ts')
const FORM = read('app', 'app', '[churchId]', 'access', 'invite-member-form.tsx')

function body(name: string): string {
  const start = ACTIONS.indexOf(`export async function ${name}(`)
  expect(start, `${name} must exist`).toBeGreaterThan(-1)
  const next = ACTIONS.indexOf('\nexport async function', start + 1)
  return ACTIONS.slice(start, next === -1 ? undefined : next)
}

describe('inviteMember — account creation at invite time', () => {
  const fn = body('inviteMember')

  it('prepares the account after the invitation row exists and before the email is sent', () => {
    const create = fn.indexOf("'create_member_invitation'")
    const prepare = fn.indexOf('prepareInvitedAccount(')
    const email = fn.indexOf('sendMemberInvitationEmail(')
    expect(create).toBeGreaterThan(-1)
    expect(prepare).toBeGreaterThan(create)
    expect(email).toBeGreaterThan(prepare)
  })

  it('reports whether the account was bound — degradation must be visible, never silent', () => {
    expect(ACTIONS).toMatch(/bound:\s*boolean/)
    expect(fn).toMatch(/bound/)
    expect(fn).toMatch(/console\.error\(/)
  })
})

describe('invite form — surfaces an unbound invitation', () => {
  it('renders a warning off the bound flag', () => {
    expect(FORM).toContain('state.bound')
  })
})

describe('resendInvitation — heals an unbound invitation', () => {
  const fn = body('resendInvitation')
  it('reads invited_user_id and prepares the account when it is missing', () => {
    expect(fn).toContain('invited_user_id')
    expect(fn).toContain('prepareInvitedAccount(')
  })
})

describe('revokeInvitation — a revoked invitee can no longer sign in to the church', () => {
  const fn = body('revokeInvitation')
  it('removes the bound membership after marking the invitation revoked', () => {
    const revoke = fn.indexOf("status: 'revoked'")
    const remove = fn.indexOf('removeChurchMember(')
    expect(revoke).toBeGreaterThan(-1)
    expect(remove).toBeGreaterThan(revoke)
    expect(fn).toContain('invited_user_id')
  })
})
