// Source-reading tripwire: the reminder route is IO-heavy (service-role client + Resend), so its
// contract is pinned by source assertions rather than execution. The pure planner + sender have
// their own behavioral tests (Task 12).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const route = fs.readFileSync(
  path.join(ROOT, 'app', 'api', 'cron', 'reminders', 'route.ts'),
  'utf8',
)

describe('reminder cron route', () => {
  it('runs on Node, never cached', () => {
    expect(route).toContain("export const runtime = 'nodejs'")
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('export async function GET')
  })
  it('is CRON_SECRET-gated (inert when unset, 401 on mismatch)', () => {
    expect(route).toContain('process.env.CRON_SECRET')
    expect(route).toContain('`Bearer ${secret}`')
    expect(route).toContain('status: 401')
  })
  it('uses the service-role client and both recipient RPCs', () => {
    expect(route).toContain('createServiceRoleClient()')
    expect(route).toContain('completion_reminder_recipients')
    expect(route).toContain('invite_reminder_recipients')
  })
  it('sends via the planner + sender and records the per-recipient dedup date', () => {
    expect(route).toContain('planCompletionReminders')
    expect(route).toContain('planInviteReminders')
    expect(route).toContain('sendReminderEmail')
    expect(route).toContain('last_reminded_on')
    expect(route).toContain('last_invite_reminded_on')
  })
})
