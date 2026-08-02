import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000200_rpc_accept_sets_deadline.sql'),
  'utf8',
)

describe('accept_member_invitation sets deadline', () => {
  it('re-creates the function inserting a 3-day deadline', () => {
    expect(sql).toContain('create or replace function public.accept_member_invitation')
    expect(sql).toContain('assessment_deadline_at')
    expect(sql).toContain("now() + interval '3 days'")
    expect(sql).toContain('on conflict (church_id, user_id) do nothing')
    expect(sql).toContain('grant execute on function public.accept_member_invitation(uuid) to authenticated')
  })
})
