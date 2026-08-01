// Source-reading tripwire (matches tests/access/resend.test.ts): the resend action must mirror the
// invite-window guard server-side, since it bumps expires_at directly and never calls the RPC.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const actions = fs.readFileSync(
  path.join(ROOT, 'app', 'app', '[churchId]', 'access', 'actions.ts'),
  'utf8',
)

describe('resend invite-window mirror', () => {
  it('imports the shared window constant', () => {
    expect(actions).toMatch(/from '@\/lib\/deadlines\/countdown'/)
    expect(actions).toContain('WINDOW_DAYS')
  })
  it('reads the earliest invite and refuses when the window is closed', () => {
    expect(actions).toContain("select('created_at')")
    expect(actions).toContain('Your 3-day invitation window has closed.')
    // the window check precedes the expiry-bumping UPDATE
    expect(actions.indexOf('Your 3-day invitation window has closed.'))
      .toBeLessThan(actions.indexOf('.update({ expires_at:'))
  })
})
