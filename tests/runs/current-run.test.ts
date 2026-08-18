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

  // ADR 0003: the answer page reads closed_at for the "closed by your church admin on <date>"
  // copy, and currentRun is the ONE canonical run lookup — extend it rather than add a second query.
  it('selects closed_at and closed_by alongside id, status and methodology_version', async () => {
    // Mutation guard: catches the select column list left at the old shape. A silently missing
    // closed_at column would make run.closed_at read `undefined` for EVERY run — indistinguishable at
    // the answer page from an old-path run, so the closed-date copy would never render.
    const selectCols: string[] = []
    await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: '0.2.0', closed_at: null, closed_by: null }, error: null }, [], selectCols),
      'c1',
    )
    expect(selectCols).toEqual(['id, status, methodology_version, closed_at, closed_by'])
  })
  it('passes closed_at / closed_by through untouched (null for an open or old-path run)', async () => {
    const closed = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'complete', methodology_version: '0.3.0', closed_at: '2026-08-18T14:03:00.000Z', closed_by: 'u1' }, error: null }),
      'c1',
    )
    expect(closed?.closed_at).toBe('2026-08-18T14:03:00.000Z')
    expect(closed?.closed_by).toBe('u1')
    const open = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: '0.3.0', closed_at: null, closed_by: null }, error: null }),
      'c1',
    )
    expect(open?.closed_at).toBeNull()
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
