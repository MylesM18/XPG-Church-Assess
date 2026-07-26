// Source-reading tripwire on the RPC migration (agent cannot run pgTAP — that's owner-only).
// Pins: admin-only gate (stricter than the member-gated coverage RPCs), active-run scope,
// member-kind filter, correct return columns, and least-privilege grants.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260725000100_rpc_get_member_category_coverage.sql'),
  'utf8',
)

describe('get_member_category_coverage migration', () => {
  it('declares the admin-gated read function with the right signature', () => {
    expect(SQL).toContain('create function public.get_member_category_coverage(p_church_id uuid)')
    expect(SQL).toContain('returns table(respondent_user_id uuid, category_id text, answered_count int)')
    expect(SQL).toContain('security definer set search_path = public')
  })
  it('gates to admins of the church (not just members)', () => {
    expect(SQL).toContain("cm.role = 'admin'")
    expect(SQL).toContain('must be an admin of this church')
  })
  it('scopes to the active run and member responses only', () => {
    expect(SQL).toContain("status = 'in_progress'")
    expect(SQL).toContain("r.respondent_kind = 'member'")
    expect(SQL).toContain('r.respondent_user_id is not null')
    expect(SQL).toContain('count(distinct r.item_id)')
  })
  it('applies least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.get_member_category_coverage(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.get_member_category_coverage(uuid) to authenticated')
  })
})
