import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same idiom as tests/report/generate-report-behavior.test.ts: hoist the mocks, replace the modules
// the action imports, THEN import the action (vi.mock is hoisted above imports regardless).
const { mockRequire, mockClose, mockReopen, mockRevalidate } = vi.hoisted(() => ({
  mockRequire: vi.fn(),
  mockClose: vi.fn(),
  mockReopen: vi.fn(),
  mockRevalidate: vi.fn(),
}))
vi.mock('@/lib/auth/require-church-admin', () => ({ requireChurchAdmin: mockRequire }))
vi.mock('@/lib/data/runs', () => ({ closeRun: mockClose, reopenRun: mockReopen }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))

import { closeAssessment, reopenAssessment } from '@/app/app/[churchId]/run-actions'

const CLIENT = { tag: 'rls-client' }
const revalidated = () => mockRevalidate.mock.calls.map((c) => c[0])

beforeEach(() => {
  mockRequire.mockReset()
  mockClose.mockReset()
  mockReopen.mockReset()
  mockRevalidate.mockReset()
  mockRequire.mockResolvedValue({ supabase: CLIENT, error: null })
})

describe('closeAssessment()', () => {
  it('closes through the seam with the RLS client and revalidates dashboard + diagnosis', async () => {
    mockClose.mockResolvedValue({ error: null })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: true })
    expect(mockClose).toHaveBeenCalledWith(CLIENT, 'c1')
    expect(mockReopen).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('maps "run is already closed" to the refresh copy AND still revalidates (spec §7)', async () => {
    mockClose.mockResolvedValue({ error: 'run is already closed' })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Already closed — refresh to see the latest state' })
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('refuses a non-admin before touching the RPC and does NOT revalidate', async () => {
    mockRequire.mockResolvedValue({ supabase: CLIENT, error: 'You must be an admin of this church.' })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Not allowed' })
    expect(mockClose).not.toHaveBeenCalled()
    expect(revalidated()).toEqual([])
  })
  it('maps the RPC admin refusal to Not allowed', async () => {
    mockClose.mockResolvedValue({ error: 'must be an admin of this church' })
    expect(await closeAssessment('c1')).toEqual({ ok: false, error: 'Not allowed' })
  })
  it('maps an unknown failure to the generic message, never the raw error', async () => {
    mockClose.mockResolvedValue({ error: 'connection reset by peer' })
    const res = await closeAssessment('c1')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Something went wrong. Please try again.')
      expect(res.error).not.toContain('peer')
    }
  })
})

describe('reopenAssessment()', () => {
  it('reopens through the seam and revalidates dashboard + diagnosis', async () => {
    mockReopen.mockResolvedValue({ error: null })
    const res = await reopenAssessment('c1')
    expect(res).toEqual({ ok: true })
    expect(mockReopen).toHaveBeenCalledWith(CLIENT, 'c1')
    expect(mockClose).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('maps "run is not closed" to the refresh copy AND still revalidates', async () => {
    mockReopen.mockResolvedValue({ error: 'run is not closed' })
    const res = await reopenAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Already open — refresh to see the latest state' })
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('refuses a non-admin before touching the RPC', async () => {
    mockRequire.mockResolvedValue({ supabase: CLIENT, error: 'You must be signed in.' })
    expect(await reopenAssessment('c1')).toEqual({ ok: false, error: 'Not allowed' })
    expect(mockReopen).not.toHaveBeenCalled()
    expect(revalidated()).toEqual([])
  })
})
