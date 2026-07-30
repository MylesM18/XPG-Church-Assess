// Source-reading tripwire on the RPC migration (agent cannot run pgTAP — that's owner-only).
// Pins: admin-only gate (stricter than the member-gated coverage RPCs), member-kind filter,
// return columns, least-privilege grants — AND that the run is resolved via the shared current_run
// seam, status-agnostically (survives completion).
//
// NOTE: this reads the LIVE definition in 20260730000100 (wave 2), which `create or replace`d the
// function onto current_run. It previously read the ORIGIN 20260725000100 and asserted that file
// still contained `status = 'in_progress'` — but that filter was dropped by 20260727000100, so the
// test passed against a superseded file while the live function no longer matched it. Re-pointed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260730000100_fn_current_run_dedup_resolution.sql'),
  'utf8',
)
// Isolate the get_member_category_coverage function body (the migration defines several functions).
const fnStart = SQL.indexOf('create or replace function public.get_member_category_coverage(')
const fnEnd = SQL.indexOf('grant execute on function public.get_member_category_coverage', fnStart)
const fn = SQL.slice(fnStart, fnEnd)

describe('get_member_category_coverage migration', () => {
  it('declares the admin-gated read function with the right signature', () => {
    expect(fn).toContain('create or replace function public.get_member_category_coverage(p_church_id uuid)')
    expect(fn).toContain('returns table(respondent_user_id uuid, category_id text, answered_count int)')
    expect(fn).toContain('security definer set search_path = public')
  })
  it('gates to admins of the church (not just members)', () => {
    expect(fn).toContain("cm.role = 'admin'")
    expect(fn).toContain('must be an admin of this church')
  })
  it('scopes via the shared current_run seam, status-agnostically, to member responses only', () => {
    expect(fn).toContain('current_run(p_church_id)') // resolves through the seam, not an inline lookup
    expect(fn, 'survives completion — no smuggled in_progress filter').not.toContain("status = 'in_progress'")
    expect(fn).toContain("r.respondent_kind = 'member'")
    expect(fn).toContain('r.respondent_user_id is not null')
    expect(fn).toContain('count(distinct r.item_id)')
  })
  it('applies least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.get_member_category_coverage(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.get_member_category_coverage(uuid) to authenticated')
  })
})
