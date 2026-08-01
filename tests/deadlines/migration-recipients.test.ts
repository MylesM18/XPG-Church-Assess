import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000800_rpc_reminder_recipients.sql'),
  'utf8',
)

describe('reminder recipient RPCs', () => {
  it('creates completion_reminder_recipients (future deadline, in_progress run)', () => {
    expect(sql).toContain('create function public.completion_reminder_recipients()')
    expect(sql).toContain('cm.assessment_deadline_at is not null')
    expect(sql).toContain('cm.assessment_deadline_at > now()')
    expect(sql).toContain("r.status = 'in_progress'")
  })
  it('creates invite_reminder_recipients (open invite window, admins)', () => {
    expect(sql).toContain('create function public.invite_reminder_recipients()')
    expect(sql).toContain('min(created_at)')
    expect(sql).toContain("now() - interval '3 days'")
    expect(sql).toContain("cm.role = 'admin'")
  })
  it('grants both to service_role only', () => {
    expect(sql).toContain('revoke all on function public.completion_reminder_recipients() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.completion_reminder_recipients() to service_role')
    expect(sql).toContain('revoke all on function public.invite_reminder_recipients() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.invite_reminder_recipients() to service_role')
  })
})
