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
 * so the test can prove the lookup is status-AGNOSTIC (filters on church_id only — never status).
 */
function fakeClient(result: { data: unknown; error: unknown }, eqCols: string[] = []) {
  const chain = {
    select: () => chain,
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
    const run = await currentRun(fakeClient({ data: { id: 'r1', status: 'complete' }, error: null }, eqCols), 'c1')
    expect(run).toEqual({ id: 'r1', status: 'complete' })
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
})
