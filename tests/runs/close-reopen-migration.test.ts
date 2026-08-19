// Source-reading tripwire (agent cannot run pgTAP — owner-only). ADR 0003: completion is an
// explicit, reversible admin action (close_run / reopen_run); save_diagnosis no longer writes run
// status; the two report-path read RPCs resolve the run through current_run() (status-agnostic).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260818000100_close_reopen_run.sql'),
  'utf8',
)
// Strip SQL line comments so negative assertions test the CODE, not the header prose.
const CODE = SQL.replace(/--.*$/gm, '')

/** The text of one `create [or replace] function public.<name>(` … up to its terminating `$$;`. */
function fnBody(name: string): string {
  const start = CODE.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`))
  expect(start, `${name} must be defined in the migration`).toBeGreaterThan(-1)
  const end = CODE.indexOf('$$;', start)
  expect(end, `${name} body must terminate with $$;`).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

describe('close / reopen migration — columns', () => {
  it('adds the nullable audit pair to assessment_runs (closed_by FK follows granted_by/accepted_by)', () => {
    expect(CODE).toContain('alter table public.assessment_runs')
    expect(CODE).toContain('add column closed_at timestamptz null')
    expect(CODE).toContain('add column closed_by uuid null references auth.users')
    // No CHECK churn: status stays 'in_progress' | 'complete'.
    expect(CODE).not.toMatch(/check\s*\(\s*status/i)
  })
})

describe('close_run', () => {
  const body = fnBody('close_run')
  it('is a security-definer admin action resolved through current_run', () => {
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
    expect(body).toContain("'no run for this church'")
  })
  it('refuses a double close and stamps status + audit columns', () => {
    expect(body).toContain("raise exception 'run is already closed'")
    expect(body).toMatch(/set status = 'complete',\s*completed_at = now\(\),\s*closed_at = now\(\),\s*closed_by = auth\.uid\(\)/)
  })
  it('has least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.close_run(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.close_run(uuid) to authenticated')
  })
})

describe('reopen_run', () => {
  const body = fnBody('reopen_run')
  it('mirrors close_run', () => {
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
    expect(body).toContain("raise exception 'run is not closed'")
    expect(body).toMatch(/set status = 'in_progress',\s*completed_at = null,\s*closed_at = null,\s*closed_by = null/)
  })
  it('has least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.reopen_run(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.reopen_run(uuid) to authenticated')
  })
})

describe('save_diagnosis (re-created)', () => {
  const body = fnBody('save_diagnosis')
  it('keeps the same signature, admin gate, and idempotent insert', () => {
    expect(body).toContain('p_church_id uuid')
    expect(body).toContain('p_response_hash text')
    expect(body).toContain('p_methodology_version text')
    expect(body).toContain('p_payload jsonb')
    expect(body).toContain(') returns void')
    expect(body).toContain("raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege'")
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('on conflict (run_id, response_hash) do nothing')
  })
  it('no longer gates on status nor writes it', () => {
    expect(body).not.toContain('run is already complete')
    expect(body).not.toContain('v_status')
    expect(body).not.toMatch(/set status\s*=/)
    expect(body).not.toContain('completed_at')
  })
  it('keeps the grants', () => {
    expect(SQL).toContain('revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon')
    expect(SQL).toContain('grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated')
  })
})

describe('get_run_responses / get_completed_run_responses (re-created, status-agnostic)', () => {
  const RETURNS =
    'returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)'
  for (const name of ['get_run_responses', 'get_completed_run_responses'] as const) {
    describe(name, () => {
      const body = fnBody(name)
      it('keeps the exact return type (plain create or replace, no drop)', () => {
        expect(body).toContain(RETURNS)
        expect(CODE).not.toContain(`drop function if exists public.${name}`)
      })
      it('resolves the run through current_run() with no inline status filter', () => {
        expect(body).toContain('select id into v_run_id from public.current_run(p_church_id)')
        expect(body).not.toMatch(/status\s*=\s*'in_progress'/)
        expect(body).not.toMatch(/status\s*=\s*'complete'/)
        expect(body).not.toContain('from public.assessment_runs')
      })
      it('keeps the member gate and projection', () => {
        expect(body).toContain("raise exception 'not a member of this church' using errcode = 'insufficient_privilege'")
        expect(body).toContain('select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection')
      })
      it('keeps the grants', () => {
        expect(SQL).toContain(`revoke all on function public.${name}(uuid) from public, anon`)
        expect(SQL).toContain(`grant execute on function public.${name}(uuid) to authenticated`)
      })
    })
  }
})

describe('the seam is used everywhere in this migration', () => {
  it('resolves the run via current_run in all five functions and never inline', () => {
    const calls = CODE.match(/current_run\(p_church_id\)/g) ?? []
    expect(calls.length).toBe(5)
    const inlineLookups = CODE.match(/from public\.assessment_runs\s+where church_id = p_church_id/g) ?? []
    expect(inlineLookups.length).toBe(0)
  })
  it('names ADR 0003 in the header', () => {
    expect(SQL).toContain('docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md')
  })
})
