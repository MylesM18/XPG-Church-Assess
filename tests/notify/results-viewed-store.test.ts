import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { claimResultsViewedEmail, markResultsViewedEmailed } from '@/lib/notify/results-viewed-store'

type Call = { name: string; args: Record<string, unknown> }

/** PostgREST-shaped fake of the service-role client: rpc resolves { data, error } and never throws. */
function fakeAdmin(opts: {
  data?: unknown
  error?: { code?: string; message: string } | null
  calls?: Call[]
}) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      opts.calls?.push({ name, args })
      return { data: opts.data ?? null, error: opts.error ?? null }
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('claimResultsViewedEmail()', () => {
  it('calls claim_results_viewed_email with the church id on the service-role client and passes a win through', async () => {
    const calls: Call[] = []
    expect(await claimResultsViewedEmail('c1', fakeAdmin({ data: true, calls }))).toBe(true)
    expect(calls).toEqual([{ name: 'claim_results_viewed_email', args: { p_church_id: 'c1' } }])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('returns false for a lost claim', async () => {
    expect(await claimResultsViewedEmail('c1', fakeAdmin({ data: false }))).toBe(false)
  })

  it('returns false for anything that is not literally true', async () => {
    expect(await claimResultsViewedEmail('c1', fakeAdmin({ data: 'true' }))).toBe(false)
    expect(await claimResultsViewedEmail('c1', fakeAdmin({ data: null }))).toBe(false)
  })

  it('returns false and warns once when the RPC errors (for example, the migration is not applied yet)', async () => {
    const admin = fakeAdmin({
      data: true,
      error: { code: 'PGRST202', message: 'Could not find the function public.claim_results_viewed_email' },
    })
    expect(await claimResultsViewedEmail('c1', admin)).toBe(false)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('returns false and warns once, without any call, when there is no service-role client', async () => {
    expect(await claimResultsViewedEmail('c1', null)).toBe(false)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('defaults to the service-role client, which is null while SUPABASE_SERVICE_ROLE_KEY is unset', async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      expect(await claimResultsViewedEmail('c1')).toBe(false)
      expect(console.warn).toHaveBeenCalledTimes(1)
    } finally {
      if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key
    }
  })
})

describe('markResultsViewedEmailed()', () => {
  it('calls mark_results_viewed_emailed with the church id on the service-role client and reports success', async () => {
    const calls: Call[] = []
    expect(await markResultsViewedEmailed('c1', fakeAdmin({ calls }))).toBe(true)
    expect(calls).toEqual([{ name: 'mark_results_viewed_emailed', args: { p_church_id: 'c1' } }])
  })

  it('returns false and warns once when the RPC errors', async () => {
    expect(await markResultsViewedEmailed('c1', fakeAdmin({ error: { message: 'boom' } }))).toBe(false)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('returns false and warns once when there is no service-role client', async () => {
    expect(await markResultsViewedEmailed('c1', null)).toBe(false)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
