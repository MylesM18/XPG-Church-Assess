import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000400_rpc_submit_self_response_deadline_lock.sql'),
  'utf8',
)

describe('submit_self_response completion lock', () => {
  it('re-creates the current_run-based body plus the deadline lock', () => {
    expect(sql).toContain('create or replace function public.submit_self_response')
    // still built on the current_run seam (not the pre-20260730 inline lookup)
    expect(sql).toContain('from public.current_run(p_church_id)')
    expect(sql).toContain('run is complete; answers are read-only')
    // the lock
    expect(sql).toContain('assessment_deadline_at is not null and now() > assessment_deadline_at')
    expect(sql).toContain('your assessment window has closed; ask an admin to reopen it')
    // lock is placed AFTER the membership check and BEFORE run resolution
    expect(sql.indexOf('your assessment window has closed'))
      .toBeLessThan(sql.indexOf('from public.current_run(p_church_id)'))
    expect(sql.indexOf('not a member of this church'))
      .toBeLessThan(sql.indexOf('your assessment window has closed'))
    expect(sql).toContain('grant execute on function public.submit_self_response(uuid, text, jsonb) to authenticated')
  })
})
