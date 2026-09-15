// Source-reading tripwire (the agent cannot run pgTAP; supabase/tests/29_results_viewed_email_test.sql
// is owner-run). Pins the database half of "one results-viewed email per closed run": two nullable
// timestamps on assessment_runs, an admin-gated claim with a 5-minute hold, and an admin-gated mark.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260915000100_results_viewed_email.sql'),
  'utf8',
)
// Strip SQL line comments so assertions test the CODE, not the header prose.
const CODE = SQL.replace(/--.*$/gm, '')

/** The text of one `create [or replace] function public.<name>(` … up to its terminating `$$;`. */
function fnBody(name: string): string {
  const start = CODE.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`))
  expect(start, `${name} must be defined in the migration`).toBeGreaterThan(-1)
  const end = CODE.indexOf('$$;', start)
  expect(end, `${name} body must terminate with $$;`).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

const UPDATE = /update public\.assessment_runs/g

describe('results-viewed email migration: columns', () => {
  it('adds the nullable claim and emailed timestamps to assessment_runs', () => {
    expect(CODE).toContain('alter table public.assessment_runs')
    expect(CODE).toContain('add column results_viewed_email_claimed_at timestamptz null')
    expect(CODE).toContain('add column results_viewed_emailed_at timestamptz null')
  })

  it('does not backfill: the only writes to assessment_runs are the two inside the functions', () => {
    expect([...CODE.matchAll(UPDATE)].length).toBe(2)
    const inside = [fnBody('claim_results_viewed_email'), fnBody('mark_results_viewed_emailed')]
      .map((body) => [...body.matchAll(UPDATE)].length)
      .reduce((a, b) => a + b, 0)
    expect(inside).toBe(2)
  })

  it('leaves close_run and reopen_run alone, so reopening and closing again never re-sends', () => {
    expect(CODE).not.toMatch(/function public\.(close_run|reopen_run)\(/)
  })
})

describe('claim_results_viewed_email', () => {
  const body = fnBody('claim_results_viewed_email')

  it('is a security-definer boolean resolved through current_run and gated by require_church_admin', () => {
    expect(body).toContain('returns boolean')
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
    // Both anchors are asserted present above and below, so indexOf cannot be -1 here.
    expect(body).toContain('update public.assessment_runs')
    expect(body.indexOf('perform public.require_church_admin(v_run.id)')).toBeLessThan(
      body.indexOf('update public.assessment_runs'),
    )
  })

  it('claims only a closed, not-yet-emailed run whose previous claim is absent or older than 5 minutes', () => {
    expect(body).toContain('set results_viewed_email_claimed_at = now()')
    expect(body).toContain("and status = 'complete'")
    expect(body).toContain('and results_viewed_emailed_at is null')
    expect(body).toMatch(
      /\(results_viewed_email_claimed_at is null\s+or results_viewed_email_claimed_at < now\(\) - interval '5 minutes'\)/,
    )
    expect(body).toContain('return v_claimed is not null')
  })
})

describe('mark_results_viewed_emailed', () => {
  const body = fnBody('mark_results_viewed_emailed')

  it('is security definer, resolved through current_run, and gated by require_church_admin', () => {
    expect(body).toContain('returns void')
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
  })

  it('stamps emailed_at once and nothing ever clears it', () => {
    expect(body).toContain('set results_viewed_emailed_at = now()')
    expect(body).toContain('and results_viewed_emailed_at is null')
    expect(CODE).not.toMatch(/results_viewed_emailed_at\s*=\s*null/)
  })
})

describe('grants', () => {
  it('revokes both functions from public and anon and grants them to authenticated', () => {
    for (const fn of ['claim_results_viewed_email', 'mark_results_viewed_emailed']) {
      expect(CODE).toContain(`revoke all on function public.${fn}(uuid) from public, anon;`)
      expect(CODE).toContain(`grant execute on function public.${fn}(uuid) to authenticated;`)
    }
  })
})
