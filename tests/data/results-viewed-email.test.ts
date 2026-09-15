import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimResultsViewedEmail, markResultsViewedEmailed } from '@/lib/data/results-viewed-email'

type ClientType = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
type Call = { name: string; args: Record<string, unknown> }

/** PostgREST-shaped fake: supabase.rpc resolves { data, error } and never throws. */
function fakeClient(opts: {
  data?: unknown
  error?: { code?: string; message: string } | null
  calls?: Call[]
}) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      opts.calls?.push({ name, args })
      return { data: opts.data ?? null, error: opts.error ?? null }
    },
  } as unknown as ClientType
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('claimResultsViewedEmail()', () => {
  it('calls claim_results_viewed_email with the church id and passes a winning claim through', async () => {
    const calls: Call[] = []
    expect(await claimResultsViewedEmail(fakeClient({ data: true, calls }), 'c1')).toBe(true)
    expect(calls).toEqual([{ name: 'claim_results_viewed_email', args: { p_church_id: 'c1' } }])
  })

  it('returns false for a lost claim', async () => {
    expect(await claimResultsViewedEmail(fakeClient({ data: false }), 'c1')).toBe(false)
  })

  it('returns false for anything that is not literally true', async () => {
    expect(await claimResultsViewedEmail(fakeClient({ data: 'true' }), 'c1')).toBe(false)
    expect(await claimResultsViewedEmail(fakeClient({ data: null }), 'c1')).toBe(false)
  })

  it('returns false and warns once when the RPC errors (for example, the migration is not applied yet)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = fakeClient({
      data: true,
      error: { code: 'PGRST202', message: 'Could not find the function public.claim_results_viewed_email' },
    })
    expect(await claimResultsViewedEmail(client, 'c1')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('markResultsViewedEmailed()', () => {
  it('calls mark_results_viewed_emailed with the church id and reports success', async () => {
    const calls: Call[] = []
    expect(await markResultsViewedEmailed(fakeClient({ calls }), 'c1')).toBe(true)
    expect(calls).toEqual([{ name: 'mark_results_viewed_emailed', args: { p_church_id: 'c1' } }])
  })

  it('returns false and warns once when the RPC errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await markResultsViewedEmailed(fakeClient({ error: { message: 'boom' } }), 'c1')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
