import { describe, it, expect } from 'vitest'
import { canAcceptAnswers, currentRun } from '@/lib/runs/current-run'

describe('canAcceptAnswers()', () => {
  it('is true only while the run is in_progress', () => {
    expect(canAcceptAnswers({ status: 'in_progress' })).toBe(true)
  })
  it('is false once the run is complete (answers are read-only)', () => {
    expect(canAcceptAnswers({ status: 'complete' })).toBe(false)
  })
  it('is false when the church has no run', () => {
    expect(canAcceptAnswers(null)).toBe(false)
  })
})

/**
 * Minimal fake of the query chain `currentRun` walks. It records the columns passed to `.eq(...)`
 * so the test can prove the lookup is status-AGNOSTIC (filters on church_id only — never status),
 * and (optionally) the string passed to `.select(...)` so a test can pin exactly which columns are
 * requested.
 */
function fakeClient(
  result: { data: unknown; error: unknown },
  eqCols: string[] = [],
  selectCols: string[] = [],
) {
  const chain = {
    select: (cols: string) => {
      selectCols.push(cols)
      return chain
    },
    eq: (col: string) => {
      eqCols.push(col)
      return chain
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  }
  return { from: () => chain } as unknown as Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
}

describe('currentRun()', () => {
  it('returns the church run regardless of status, filtering on church_id only', async () => {
    const eqCols: string[] = []
    const run = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'complete', methodology_version: '0.3.0' }, error: null }, eqCols),
      'c1',
    )
    expect(run).toEqual({ id: 'r1', status: 'complete', methodology_version: '0.3.0' })
    // status-agnostic: the reintroduced `status = 'in_progress'` filter (the drift bug) would show here
    expect(eqCols).toEqual(['church_id'])
  })
  it('returns null when the church has no run', async () => {
    expect(await currentRun(fakeClient({ data: null, error: null }), 'c1')).toBeNull()
  })
  it('throws on a query error', async () => {
    await expect(
      currentRun(fakeClient({ data: null, error: new Error('boom') }), 'c1'),
    ).rejects.toThrow('boom')
  })

  // Task 29 (owner ruling, 2026-08-08): the answer page needs the run's methodology_version to
  // compute its effective item list, and currentRun is the one canonical "church's single run"
  // lookup — extending it (rather than a second bespoke query) is what lets the answer page reuse
  // a single round trip for both `status` (writability) and `methodology_version` (effective items).
  it('selects methodology_version alongside id and status', async () => {
    // Mutation guard: catches the select column list left at the old 'id, status' shape. A silently
    // missing methodology_version column would make run.methodology_version read `undefined` for
    // EVERY run (not just unstamped ones) — indistinguishable at call sites from an explicit null via
    // `?? null`, but for a CURRENT-edition run that wrongly forces the pre-0.3.0 (item-filtered)
    // branch, hiding the outreach items from members it should be offering them to.
    const selectCols: string[] = []
    await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: '0.2.0' }, error: null }, [], selectCols),
      'c1',
    )
    expect(selectCols).toEqual(['id, status, methodology_version'])
  })
  it('passes methodology_version through untouched, including null for an unstamped run', async () => {
    // Mutation guard: catches a well-intentioned `?? OUTREACH_VERSION` (or any non-null) default
    // sneaking into currentRun itself — the null-means-predates contract must survive this seam
    // unmodified; defaulting belongs to each call site's own `?? null`, not to the lookup.
    const run = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: null }, error: null }),
      'c1',
    )
    expect(run?.methodology_version).toBeNull()
  })
})
