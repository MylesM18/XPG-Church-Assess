// Source-reading tripwire: a Resend action + button exist and are wired into pending rows,
// resend bumps expiry via a scoped UPDATE (not create_member_invitation) and re-emails, and
// the manage-access page carries its intro line. Resend's lookup has no expiry gate: a
// lapsed-but-unrevoked ('pending') invite is deliberately revived, not refused, so its
// UPDATE resets the 14-day clock rather than requiring the row to still be unexpired.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const ACCESS = ['app', 'app', '[churchId]', 'access']
const actions = read(...ACCESS, 'actions.ts')
const button = read(...ACCESS, 'resend-invite-button.tsx')
const pending = read(...ACCESS, 'pending-invites-list.tsx')
const accessPage = read(...ACCESS, 'page.tsx')

describe('resend pending invitation', () => {
  it('exports a resendInvitation server action', () => {
    expect(actions).toContain('export async function resendInvitation')
  })
  it('bumps expiry via a scoped update and re-emails (best-effort)', () => {
    // resend must NOT create a new invite row — it does a scoped UPDATE of expires_at.
    // (Can't assert the whole file lacks create_member_invitation — inviteMember legitimately
    //  calls it — so pin resend's own mechanism instead.)
    expect(actions).toContain('.update({ expires_at:')
    expect(actions).toContain('This invitation is no longer pending.')
    expect(actions).toContain('sendMemberInvitationEmail')
  })
  it('provides a Resend button wired to the action', () => {
    expect(button).toContain('resendInvitation')
    expect(button).toContain('ResendInviteButton')
  })
  it('renders the Resend button on each pending row', () => {
    expect(pending).toContain('ResendInviteButton')
  })
  it('gives manage-access a one-line intro', () => {
    expect(accessPage).toContain("Manage who can access this church's assessment.")
  })
})
