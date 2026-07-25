// Source-reading tripwire (node env, no DOM): asserts on the access UI source that the role
// vocabulary is "Member"/"Co-admin" (DB values stay admin|viewer) and the (i) explainer is wired.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const ACCESS = ['app', 'app', '[churchId]', 'access']
const form = read(...ACCESS, 'invite-member-form.tsx')
const members = read(...ACCESS, 'members-list.tsx')
const pending = read(...ACCESS, 'pending-invites-list.tsx')
const actions = read(...ACCESS, 'actions.ts')

describe('role vocabulary + info', () => {
  it('offers Member (default) and Co-admin in the invite select', () => {
    expect(form).toContain('<option value="Member">Member</option>')
    expect(form).toContain('<option value="Co-admin">Co-admin</option>')
    expect(form).toContain('defaultValue="Member"')
    expect(form).not.toContain('>Viewer<')
  })
  it('wires the (i) role explainer via FieldInfo, labelling the select', () => {
    expect(form).toContain('FieldInfo')
    expect(form).toContain('htmlFor="invite-role"')
    expect(form).toContain('id="invite-role"')
    expect(form).toContain('Members only answer the assessment.')
  })
  it('displays the viewer role as "Member" in both lists', () => {
    expect(members).toContain("'Co-admin' : 'Member'")
    expect(pending).toContain("'Co-admin' : 'Member'")
    expect(members).not.toContain("'Viewer'")
    expect(pending).not.toContain("'Viewer'")
  })
  it('maps role input through the shared helper', () => {
    expect(actions).toContain('mapRoleInput')
  })
})
