import { describe, it, expect } from 'vitest'
import { churchName } from '@/lib/data/churches'

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
