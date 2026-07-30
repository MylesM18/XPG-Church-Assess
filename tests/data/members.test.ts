import { describe, it, expect } from 'vitest'
import { memberRole, removeChurchMember, churchMembers } from '@/lib/data/members'

type ClientType = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function fakeClient(opts: {
  data?: unknown
  rpcData?: unknown
  rpcError?: unknown
  eqCols?: string[]
  rpcArgs?: Record<string, unknown>[]
}) {
  const chain = {
    select: () => chain,
    eq: (col: string) => {
      opts.eqCols?.push(col)
      return chain
    },
    maybeSingle: async () => ({ data: opts.data ?? null }),
  }
  return {
    from: () => chain,
    rpc: async (_name: string, args: Record<string, unknown>) => {
      opts.rpcArgs?.push(args)
      return { data: opts.rpcData ?? null, error: opts.rpcError ?? null }
    },
  } as unknown as ClientType
}

describe('memberRole()', () => {
  it('returns the role when the caller holds a membership row', async () => {
    expect(await memberRole(fakeClient({ data: { role: 'admin' } }), 'c1', 'u1')).toBe('admin')
    expect(await memberRole(fakeClient({ data: { role: 'viewer' } }), 'c1', 'u1')).toBe('viewer')
  })
  it('returns null when there is no membership row', async () => {
    expect(await memberRole(fakeClient({ data: null }), 'c1', 'u1')).toBeNull()
  })
  it('scopes the lookup to church_id and user_id', async () => {
    const eqCols: string[] = []
    await memberRole(fakeClient({ data: { role: 'admin' }, eqCols }), 'c1', 'u1')
    expect(eqCols).toEqual(['church_id', 'user_id'])
  })
})

describe('removeChurchMember()', () => {
  it('returns no error on success and passes the RPC its scoped args', async () => {
    const rpcArgs: Record<string, unknown>[] = []
    const res = await removeChurchMember(fakeClient({ rpcArgs }), 'c1', 'u2')
    expect(res).toEqual({ error: null })
    expect(rpcArgs).toEqual([{ p_church_id: 'c1', p_user_id: 'u2' }])
  })
  it('surfaces the RPC refusal message (e.g. last-admin guard)', async () => {
    const res = await removeChurchMember(fakeClient({ rpcError: { message: 'cannot remove the last admin' } }), 'c1', 'u2')
    expect(res).toEqual({ error: 'cannot remove the last admin' })
  })
})

describe('churchMembers()', () => {
  it('returns the roster rows (typed by the caller)', async () => {
    const rpcArgs: Record<string, unknown>[] = []
    const rows = await churchMembers<{ user_id: string; role: string }>(
      fakeClient({ rpcData: [{ user_id: 'u1', role: 'admin' }], rpcArgs }),
      'c1',
    )
    expect(rows).toEqual([{ user_id: 'u1', role: 'admin' }])
    expect(rpcArgs).toEqual([{ p_church_id: 'c1' }])
  })
  it('defaults to [] when the RPC returns nothing', async () => {
    expect(await churchMembers(fakeClient({ rpcData: null }), 'c1')).toEqual([])
  })
})
