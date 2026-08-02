import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const actions = read('app', 'app', '[churchId]', 'access', 'actions.ts')
const list = read('app', 'app', '[churchId]', 'access', 'members-list.tsx')
const button = read('app', 'app', '[churchId]', 'access', 'extend-deadline-button.tsx')

describe('extend deadline control', () => {
  it('adds an extendMemberDeadline server action calling the RPC', () => {
    expect(actions).toContain('export async function extendMemberDeadline')
    expect(actions).toContain('extend_member_deadline')
  })
  it('Member type carries the deadline and the list renders days-left + Extend', () => {
    expect(list).toContain('assessment_deadline_at')
    expect(list).toContain('completionWindowState')
    expect(list).toContain('memberDaysLeftText')
    expect(list).toContain('ExtendDeadlineButton')
  })
  it('Extend button is wired to the action', () => {
    expect(button).toContain('extendMemberDeadline')
    expect(button).toContain('ExtendDeadlineButton')
  })
})
