import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { createInvitation } from '@/app/app/[churchId]/actions'
import { loadMethodology } from '@/lib/methodology/load'

const CHURCH = '11111111-1111-1111-1111-111111111111'
const CATEGORY = loadMethodology().questions.categories[0]!.id // a valid slug, e.g. 'guest'

beforeEach(() => {
  mockRevalidatePath.mockReset()
  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Grace Church' }, error: null }) }) }) }),
    rpc: async (name: string) => (name === 'create_invitation'
      ? { data: '22222222-2222-2222-2222-222222222222', error: null }
      : { data: null, error: null }),
  })
})

describe('createInvitation', () => {
  it('revalidates the dashboard after a successful send so the invitee list refreshes', async () => {
    const fd = new FormData()
    fd.set('church_id', CHURCH)
    fd.set('category_id', CATEGORY)
    fd.set('invited_name', 'Sam Taylor')
    // no invited_contact → no email attempt
    const result = await createInvitation({ link: null, emailed: false, error: null }, fd)

    expect(result.error).toBeNull()
    expect(result.link).toContain('/respond/22222222-2222-2222-2222-222222222222')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/${CHURCH}`)
  })
})
