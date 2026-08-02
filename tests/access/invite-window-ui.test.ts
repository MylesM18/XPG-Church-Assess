import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const page = read('app', 'app', '[churchId]', 'page.tsx')
const form = read('app', 'app', '[churchId]', 'access', 'invite-member-form.tsx')
const invitations = read('lib', 'data', 'invitations.ts')

describe('invite-window UI', () => {
  it('adds an earliestInviteAt read helper', () => {
    expect(invitations).toContain('export async function earliestInviteAt')
    expect(invitations).toContain("select('created_at')")
  })
  it('dashboard computes the invite window and passes it to the form', () => {
    expect(page).toContain('earliestInviteAt')
    expect(page).toContain('inviteWindowState')
    expect(page).toContain('inviteBannerText')
    expect(page).toContain('inviteWindow={inviteWindow}')
  })
  it('form shows the box counter and gates submit when closed', () => {
    expect(form).toContain('inviteWindow')
    expect(form).toContain('inviteBoxText')
    expect(form).toContain('!inviteWindow.open')
    expect(form).toContain('aria-disabled={pending || closed}')
  })
})
