import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000300_rpc_create_member_invitation_window_guard.sql'),
  'utf8',
)

describe('create_member_invitation invite-window guard', () => {
  it('re-creates the function with the 3-day window guard', () => {
    expect(sql).toContain('create or replace function public.create_member_invitation')
    expect(sql).toContain("min(created_at)")
    expect(sql).toContain("now() - interval '3 days'")
    expect(sql).toContain('your 3-day invitation window has closed')
    // guard sits BEFORE the existing pending-duplicate check
    expect(sql.indexOf('your 3-day invitation window has closed'))
      .toBeLessThan(sql.indexOf('a pending invitation already exists for that email'))
    expect(sql).toContain('grant execute on function public.create_member_invitation(uuid, text, text) to authenticated')
  })
})
