import { describe, it, expect } from 'vitest'
import { closeRun, reopenRun } from '@/lib/data/runs'

type ClientType = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function fakeClient(opts: {
  rpcError?: unknown
  rpcCalls?: Array<{ name: string; args: Record<string, unknown> }>
}) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      opts.rpcCalls?.push({ name, args })
      return { data: null, error: opts.rpcError ?? null }
    },
  } as unknown as ClientType
}

describe('closeRun()', () => {
  it('calls close_run with the church id and returns no error on success', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const res = await closeRun(fakeClient({ rpcCalls }), 'c1')
    expect(res).toEqual({ error: null })
    expect(rpcCalls).toEqual([{ name: 'close_run', args: { p_church_id: 'c1' } }])
  })
  it('surfaces the RPC refusal message (e.g. run is already closed)', async () => {
    const res = await closeRun(fakeClient({ rpcError: { message: 'run is already closed' } }), 'c1')
    expect(res).toEqual({ error: 'run is already closed' })
  })
})

describe('reopenRun()', () => {
  it('calls reopen_run with the church id and returns no error on success', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const res = await reopenRun(fakeClient({ rpcCalls }), 'c1')
    expect(res).toEqual({ error: null })
    expect(rpcCalls).toEqual([{ name: 'reopen_run', args: { p_church_id: 'c1' } }])
  })
  it('surfaces the RPC refusal message (e.g. run is not closed)', async () => {
    const res = await reopenRun(fakeClient({ rpcError: { message: 'run is not closed' } }), 'c1')
    expect(res).toEqual({ error: 'run is not closed' })
  })
})
