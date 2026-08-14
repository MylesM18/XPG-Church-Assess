import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Source-text pinning for 20260814000100_rpc_save_report_upsert.sql, following the house idiom in
// tests/deadlines/migration-accept.test.ts. This is the ONLY runnable gate for this migration —
// the behavioral cover lives in supabase/tests/25_reports_test.sql (block 11), which is
// OWNER-APPLIED and is never executed by the agent.
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260814000100_rpc_save_report_upsert.sql'),
  'utf8',
)

// The header comment quotes the OLD `do nothing` clause verbatim to explain what changed, so the
// negative assertions below must run against executable SQL only — matching the whole file would
// pass on the prose and prove nothing.
const body = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('save_report becomes an upsert (20260814000100)', () => {
  it('re-creates the function at the unchanged signature, with grants re-issued', () => {
    expect(body).toContain('create or replace function public.save_report')
    expect(body).toContain(
      'revoke all on function public.save_report(uuid, text, text, jsonb) from public, anon',
    )
    expect(body).toContain(
      'grant execute on function public.save_report(uuid, text, text, jsonb) to authenticated',
    )
  })

  it('ends in do update and no longer contains an executable do nothing', () => {
    expect(body).toContain('on conflict (run_id, inputs_hash) do update')
    expect(body).not.toMatch(/on conflict[\s\S]*?do nothing/)
  })

  it('refreshes every mutable payload column from excluded, plus generated_at', () => {
    for (const col of [
      'methodology_version',
      'archetype',
      'tier',
      'facts',
      'sections',
      'section_sources',
    ]) {
      expect(body).toMatch(new RegExp(`${col}\\s*=\\s*excluded\\.${col}`))
    }
    expect(body).toMatch(/generated_at\s*=\s*now\(\)/)
  })

  it('leaves church_id out of the update list (run_id determines the church)', () => {
    expect(body).not.toMatch(/church_id\s*=\s*excluded\.church_id/)
  })

  it('keeps the admin gate and the status-agnostic run resolver intact', () => {
    expect(body).toContain('perform public.require_church_admin(v_run_id)')
    expect(body).toContain('from public.current_run(p_church_id)')
  })
})
