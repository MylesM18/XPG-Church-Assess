// Source-reading tripwire (agent cannot run pgTAP — owner-only). Wave 2 of review-only completion:
// "which run" is resolved in ONE place, public.current_run(), and writes gate on status explicitly
// with an accurate message instead of the misleading `no active run` on a completed run.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260730000100_fn_current_run_dedup_resolution.sql'),
  'utf8',
)
// Strip SQL line comments so negative assertions test the CODE, not the header that documents the
// old drift pattern (`[and status = 'in_progress']`) it replaces.
const CODE = SQL.replace(/--.*$/gm, '')

describe('current_run seam + write-gate migration', () => {
  it('declares the status-agnostic current_run resolver with least-privilege grants', () => {
    expect(SQL).toContain('create or replace function public.current_run(p_church_id uuid)')
    expect(SQL).toContain('returns setof public.assessment_runs')
    expect(SQL).toContain('revoke all on function public.current_run(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.current_run(uuid) to authenticated')
  })

  it('resolves the run through the seam everywhere — no inline lookup, no smuggled status filter', () => {
    // 6 rewritten RPCs (2 writes + 4 reads) each resolve via the shared function.
    const calls = CODE.match(/current_run\(p_church_id\)/g) ?? []
    expect(calls.length).toBe(6)
    // The drift bug was the policy `and status = 'in_progress'` hidden inside the lookup — gone.
    expect(CODE).not.toContain("and status = 'in_progress'")
    // The run lookup now lives in exactly ONE place — current_run itself — not re-inlined per RPC.
    const inlineLookups = CODE.match(/from public\.assessment_runs\s+where church_id = p_church_id/g) ?? []
    expect(inlineLookups.length).toBe(1)
  })

  it('writes gate on writability with an accurate, non-misleading message', () => {
    expect(SQL).toContain("v_status <> 'in_progress'")
    expect(SQL).toContain('run is complete; answers are read-only')
  })
})
