// Source-reading tripwire: the invite form now lives on the dashboard (admin-only), not on
// manage-access; the form's own heading is gone (the section provides one); inviteMember
// revalidates the dashboard.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const DIR = ['app', 'app', '[churchId]']
const dash = read(...DIR, 'page.tsx')
const accessPage = read(...DIR, 'access', 'page.tsx')
const form = read(...DIR, 'access', 'invite-member-form.tsx')
const actions = read(...DIR, 'access', 'actions.ts')

describe('invite form relocated to dashboard', () => {
  it('dashboard imports and renders the invite form with the confirmed heading + copy', () => {
    expect(dash).toContain('invite-member-form')
    expect(dash).toContain('InviteMemberForm')
    expect(dash).toContain('Invite Member')
    expect(dash).toContain("Invite a member or co-admin to help with your church's assessment.")
  })
  it('manage-access no longer renders the invite form', () => {
    expect(accessPage).not.toContain('InviteMemberForm')
  })
  it('removes the form’s own duplicate heading', () => {
    expect(form).not.toContain('Invite a leader')
  })
  it('inviteMember revalidates the dashboard path too', () => {
    expect(actions).toContain('revalidatePath(`/app/${churchId}`)')
  })
})
