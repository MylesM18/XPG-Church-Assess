import { describe, it, expect } from 'vitest'
import { churchName, loadChurchForMember, createChurchWithAdmin, loadChurchProfile, updateChurchProfile, type ChurchProfile } from '@/lib/data/churches'

type ClientType = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function fakeClient(data: unknown, eqCols: string[] = []) {
  const chain = {
    select: () => chain,
    eq: (col: string) => {
      eqCols.push(col)
      return chain
    },
    maybeSingle: async () => ({ data }),
  }
  return { from: () => chain } as unknown as ClientType
}

describe('churchName()', () => {
  it('returns the church name when visible', async () => {
    expect(await churchName(fakeClient({ name: 'Grace Chapel' }), 'c1')).toBe('Grace Chapel')
  })
  it('returns null when the church is not visible to the caller', async () => {
    expect(await churchName(fakeClient(null), 'c1')).toBeNull()
  })
  it('scopes the lookup to the church id', async () => {
    const eqCols: string[] = []
    await churchName(fakeClient({ name: 'X' }, eqCols), 'c1')
    expect(eqCols).toEqual(['id'])
  })
})

function tablesClient(opts: {
  churches?: unknown
  churchesError?: unknown
  church_members?: unknown
  rpcData?: unknown
  rpcError?: unknown
  rpcArgs?: Record<string, unknown>[]
}) {
  const table = (data: unknown, error: unknown = null) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error }) }
    return chain
  }
  return {
    from: (name: string) =>
      name === 'churches'
        ? table(opts.churches ?? null, opts.churchesError ?? null)
        : table(opts.church_members ?? null),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      opts.rpcArgs?.push(args)
      return { data: opts.rpcData ?? null, error: opts.rpcError ?? null }
    },
  } as unknown as ClientType
}

const CHURCH = { id: 'c1', name: 'Grace', brand_color: '#123456', attendance_band: '100_249' }

describe('loadChurchForMember()', () => {
  it('returns the church and the caller role together', async () => {
    const res = await loadChurchForMember(
      tablesClient({ churches: CHURCH, church_members: { role: 'admin' } }),
      'c1',
      'u1',
    )
    expect(res).toEqual({ church: CHURCH, role: 'admin' })
  })
  it('returns no church and no role when the church is not visible', async () => {
    expect(await loadChurchForMember(tablesClient({ churches: null }), 'c1', 'u1')).toEqual({
      church: null,
      role: null,
    })
  })
  it('throws on an unexpected church-load error (not masked as not-found)', async () => {
    await expect(
      loadChurchForMember(tablesClient({ churchesError: new Error('boom') }), 'c1', 'u1'),
    ).rejects.toThrow('boom')
  })
})

describe('createChurchWithAdmin()', () => {
  it('returns the new church id parsed from the RPC row', async () => {
    const rpcArgs: Record<string, unknown>[] = []
    const res = await createChurchWithAdmin(
      tablesClient({ rpcData: [{ church_id: 'c9', run_id: 'r9' }], rpcArgs }),
      { p_name: 'Grace' },
    )
    expect(res).toEqual({ churchId: 'c9', error: null })
    expect(rpcArgs).toEqual([{ p_name: 'Grace' }])
  })
  it('surfaces the RPC error message', async () => {
    const res = await createChurchWithAdmin(tablesClient({ rpcError: { message: 'name taken' } }), {})
    expect(res).toEqual({ churchId: null, error: 'name taken' })
  })
  it('returns a null id when the RPC yields no row', async () => {
    expect(await createChurchWithAdmin(tablesClient({ rpcData: null }), {})).toEqual({
      churchId: null,
      error: null,
    })
  })
})

const PROFILE: ChurchProfile = {
  id: 'c1',
  name: 'Grace',
  denomination: null,
  context: 'urban',
  attendance_band: '100_249',
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: null,
  campuses_band: '2_3',
  facility_status: 'owned',
  leadership_history: null,
  consultant_notes: null,
}

describe('loadChurchProfile()', () => {
  it('returns the full profile row when visible', async () => {
    expect(await loadChurchProfile(fakeClient(PROFILE), 'c1')).toEqual(PROFILE)
  })
  it('returns null when the church is not visible to the caller', async () => {
    expect(await loadChurchProfile(fakeClient(null), 'c1')).toBeNull()
  })
  it('scopes the lookup to the church id', async () => {
    const eqCols: string[] = []
    await loadChurchProfile(fakeClient(PROFILE, eqCols), 'c1')
    expect(eqCols).toEqual(['id'])
  })
})

function updateClient(opts: {
  error?: { message: string } | null
  calls?: Array<{ fields: unknown; eq: [string, unknown] }>
}) {
  return {
    from: () => ({
      update: (fields: unknown) => ({
        eq: async (col: string, val: unknown) => {
          opts.calls?.push({ fields, eq: [col, val] })
          return { error: opts.error ?? null }
        },
      }),
    }),
  } as unknown as ClientType
}

describe('updateChurchProfile()', () => {
  it('updates the given fields scoped to the church id', async () => {
    const calls: Array<{ fields: unknown; eq: [string, unknown] }> = []
    const res = await updateChurchProfile(updateClient({ calls }), 'c1', {
      denomination: 'Baptist',
      consultant_notes: null,
    })
    expect(res).toEqual({ error: null })
    expect(calls).toEqual([
      { fields: { denomination: 'Baptist', consultant_notes: null }, eq: ['id', 'c1'] },
    ])
  })
  it('surfaces the RLS/DB error message', async () => {
    const res = await updateChurchProfile(updateClient({ error: { message: 'denied' } }), 'c1', {})
    expect(res).toEqual({ error: 'denied' })
  })
})
