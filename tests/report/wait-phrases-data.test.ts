import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { loadWaitPhrases, WAIT_PHRASES_TIMEOUT_MS } from '@/lib/data/wait-phrases'
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
function fakeClient(
  result: { data: Row[] | null; error: { message: string } | null },
  opts: { neverSettles?: boolean } = {},
) {
  const calls: {
    table?: string
    filters: Array<[string, unknown]>
    order: string[]
    signal?: AbortSignal
  } = { filters: [], order: [] }
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      calls.filters.push([col, val])
      return api
    },
    order: (col: string) => {
      calls.order.push(col)
      return api
    },
    abortSignal: (signal: AbortSignal) => {
      calls.signal = signal
      return api
    },
    // A hung PostgREST: never resolves on its own, and rejects when the signal aborts —
    // exactly what fetch does with an AbortSignal.
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => {
      if (!opts.neverSettles) return resolve(result)
      calls.signal?.addEventListener('abort', () =>
        reject?.(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
      )
      return undefined
    },
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
    // Only the active rows, ordered deliberately rather than by insertion accident. `sort_order`
    // is deliberately NOT unique (reordering by hand should not have to dodge a constraint) and
    // Postgres gives no order among equal keys, so `phrase` — which IS unique — is the tie-breaker.
    // created_at would not work: the seed inserts every row in one statement, so they share it.
    expect(calls.filters).toContainEqual(['active', true])
    expect(calls.order).toEqual(['sort_order', 'phrase'])
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

describe('the read is bounded — decorative copy may not hold up the page render', () => {
  // Greptile P2 on PR #83: the fallback only fired once the request RESOLVED with an error. A
  // PostgREST that answers slowly, or never, would block this serial await and with it the whole
  // diagnosis Server Component — for content that already has local defaults. Every other await on
  // that page is load-bearing; this one is not, so it is the only one that must be capped.
  it('passes an AbortSignal with a short, sane cap', async () => {
    const { client, calls } = fakeClient({ data: [{ phrase: 'Stored.' }], error: null })

    await loadWaitPhrases(client)

    expect(calls.signal).toBeInstanceOf(AbortSignal)
    expect(WAIT_PHRASES_TIMEOUT_MS).toBeGreaterThan(0)
    expect(WAIT_PHRASES_TIMEOUT_MS).toBeLessThanOrEqual(1000)
  })

  it('a query that NEVER settles still resolves to the shipped defaults once the signal fires', async () => {
    const { client } = fakeClient({ data: null, error: null }, { neverSettles: true })

    const started = Date.now()
    await expect(loadWaitPhrases(client)).resolves.toEqual([...WAIT_PHRASE_DEFAULTS])
    // Bounded by the cap, not by luck: without the signal this test would hang until vitest's
    // own timeout killed it.
    expect(Date.now() - started).toBeLessThan(WAIT_PHRASES_TIMEOUT_MS + 2000)
    expect(reportLines()).toHaveLength(1)
  })
})
