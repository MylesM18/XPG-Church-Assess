import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { loadWaitPhrases } from '@/lib/data/wait-phrases'
import { WAIT_PHRASE_DEFAULTS } from '@/lib/report/wait-phrases'

/**
 * The reassurance lines are read from `public.report_wait_phrases` so Natalie can reword them in
 * the Supabase dashboard without a deploy (feat/report-wait-experience). That table is created by
 * a migration SHE applies, and on this project migrations have historically lagged the merge — so
 * every failure mode here has to degrade to the shipped defaults rather than to a blank line
 * beside a spinner. This drives the real function against a PostgREST-shaped fake, the same
 * pattern tests/report/regenerate-behavior.test.ts uses.
 */

type Row = Record<string, unknown>

/** Minimal PostgREST-shaped fake: select().eq().order() resolving via then(). */
function fakeClient(result: { data: Row[] | null; error: { message: string } | null }) {
  const calls: { table?: string; filters: Array<[string, unknown]>; order?: string } = { filters: [] }
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      calls.filters.push([col, val])
      return api
    },
    order: (col: string) => {
      calls.order = col
      return api
    },
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  }
  const client = {
    from: (table: string) => {
      calls.table = table
      return api
    },
  }
  return { client: client as never, calls }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

const reportLines = () =>
  warnSpy.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => l.startsWith('[report]'))

describe('loadWaitPhrases', () => {
  it('returns the stored phrases in the order the table gives them', async () => {
    const { client, calls } = fakeClient({
      data: [{ phrase: 'First line.' }, { phrase: 'Second line.' }],
      error: null,
    })

    await expect(loadWaitPhrases(client)).resolves.toEqual(['First line.', 'Second line.'])
    expect(calls.table).toBe('report_wait_phrases')
    // Only the active rows, ordered deliberately rather than by insertion accident.
    expect(calls.filters).toContainEqual(['active', true])
    expect(calls.order).toBe('sort_order')
  })

  it('falls back to the shipped defaults when the table is MISSING — the migration may not be applied yet', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'relation "public.report_wait_phrases" does not exist' },
    })

    await expect(loadWaitPhrases(client)).resolves.toEqual([...WAIT_PHRASE_DEFAULTS])
  })

  it('names the read failure under [report], reason only — never a row', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'connection reset' } })

    await loadWaitPhrases(client)

    const lines = reportLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('wait phrases')
    expect(lines[0]).toContain('connection reset')
  })

  it('falls back when the table exists but is empty, rather than showing a blank line', async () => {
    const { client } = fakeClient({ data: [], error: null })

    await expect(loadWaitPhrases(client)).resolves.toEqual([...WAIT_PHRASE_DEFAULTS])
    // An empty table is a configuration state, not a failure: nothing to log.
    expect(reportLines()).toEqual([])
  })

  it('drops blank and non-string rows, and trims what it keeps', async () => {
    const { client } = fakeClient({
      data: [{ phrase: '  Padded.  ' }, { phrase: '   ' }, { phrase: null }, { phrase: 42 }, { phrase: 'Kept.' }],
      error: null,
    })

    await expect(loadWaitPhrases(client)).resolves.toEqual(['Padded.', 'Kept.'])
  })

  it('falls back when every stored row is blank — a table of empty strings is not a phrase list', async () => {
    const { client } = fakeClient({ data: [{ phrase: '  ' }, { phrase: '' }], error: null })

    await expect(loadWaitPhrases(client)).resolves.toEqual([...WAIT_PHRASE_DEFAULTS])
  })

  it('never throws — a wait line must not be able to break the diagnosis page render', async () => {
    const exploding = {
      from: () => {
        throw new Error('client blew up')
      },
    } as never

    await expect(loadWaitPhrases(exploding)).resolves.toEqual([...WAIT_PHRASE_DEFAULTS])
    expect(reportLines()).toHaveLength(1)
  })
})
