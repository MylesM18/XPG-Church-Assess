import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000500_rpc_extend_member_deadline.sql'),
  'utf8',
)

describe('extend_member_deadline RPC', () => {
  it('creates an admin-gated, null-safe extend function', () => {
    expect(sql).toContain('create function public.extend_member_deadline(p_church_id uuid, p_user_id uuid)')
    expect(sql).toContain('returns timestamptz')
    expect(sql).toContain('security definer')
    expect(sql).toContain('must be an admin of this church')
    expect(sql).toContain("set assessment_deadline_at = now() + interval '3 days'")
    // null-target guard: an untimed member (founder) is never made timed
    expect(sql).toContain('and assessment_deadline_at is not null')
    expect(sql).toContain('revoke all on function public.extend_member_deadline(uuid, uuid) from public, anon')
    expect(sql).toContain('grant execute on function public.extend_member_deadline(uuid, uuid) to authenticated')
  })
})
