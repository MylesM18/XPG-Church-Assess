import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  notifyResultsViewed,
  resultsViewedSummary,
  type NotifyResultsViewedInput,
  type ResultsViewedSummary,
} from '@/lib/notify/results-viewed'

const SUMMARY: ResultsViewedSummary = {
  churchName: 'Grace Chapel',
  overallScore: 69,
  healthStage: 'Growth Constrained',
  areas: [{ name: 'Governance / Accountability', score: 76 }],
}

/** An admin opening the report of a closed run: the only input that may send. */
const CLOSED: NotifyResultsViewedInput = {
  viewerIsAdmin: true,
  runStatus: 'complete',
  buildSummary: () => SUMMARY,
}

function fakeDeps(opts: {
  claim?: () => Promise<boolean>
  send?: (summary: ResultsViewedSummary) => Promise<{ ok: boolean }>
  mark?: () => Promise<boolean>
} = {}) {
  return {
    claim: vi.fn(opts.claim ?? (async () => true)),
    send: vi.fn(opts.send ?? (async () => ({ ok: true }))),
    mark: vi.fn(opts.mark ?? (async () => true)),
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('notifyResultsViewed: when it sends', () => {
  it('claims, sends the built summary, and marks when an admin opens a closed report', async () => {
    const deps = fakeDeps()
    await expect(notifyResultsViewed(CLOSED, deps)).resolves.toBe('sent')
    expect(deps.claim).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledWith(SUMMARY)
    expect(deps.mark).toHaveBeenCalledTimes(1)
  })

  it('claims before it sends and sends before it marks', async () => {
    const order: string[] = []
    const deps = fakeDeps({
      claim: async () => { order.push('claim'); return true },
      send: async () => { order.push('send'); return { ok: true } },
      mark: async () => { order.push('mark'); return true },
    })
    await notifyResultsViewed(CLOSED, deps)
    expect(order).toEqual(['claim', 'send', 'mark'])
  })
})

describe('notifyResultsViewed: when it does not send', () => {
  it('skips a viewer who is not an admin without touching the database or Resend', async () => {
    const deps = fakeDeps()
    await expect(notifyResultsViewed({ ...CLOSED, viewerIsAdmin: false }, deps)).resolves.toBe('skipped')
    expect(deps.claim).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.mark).not.toHaveBeenCalled()
  })

  it('skips an assessment that is still open', async () => {
    const deps = fakeDeps()
    await expect(notifyResultsViewed({ ...CLOSED, runStatus: 'in_progress' }, deps)).resolves.toBe('skipped')
    expect(deps.claim).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('sends nothing when an earlier view already claimed or sent it', async () => {
    const deps = fakeDeps({ claim: async () => false })
    await expect(notifyResultsViewed(CLOSED, deps)).resolves.toBe('not_claimed')
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.mark).not.toHaveBeenCalled()
  })
})

describe('notifyResultsViewed: failures resolve, so the report always opens', () => {
  it('does not mark a failed send, so a later admin view retries, and logs a reason', async () => {
    const deps = fakeDeps({ send: async () => ({ ok: false }) })
    await expect(notifyResultsViewed(CLOSED, deps)).resolves.toBe('send_failed')
    expect(deps.mark).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('treats a send that throws as a failed send', async () => {
    const deps = fakeDeps({ send: async () => { throw new Error('network down') } })
    await expect(notifyResultsViewed(CLOSED, deps)).resolves.toBe('send_failed')
    expect(deps.mark).not.toHaveBeenCalled()
  })

  it('still reports sent when the mark fails or throws after the email went out', async () => {
    await expect(notifyResultsViewed(CLOSED, fakeDeps({ mark: async () => false }))).resolves.toBe('sent')
    await expect(
      notifyResultsViewed(CLOSED, fakeDeps({ mark: async () => { throw new Error('db down') } })),
    ).resolves.toBe('sent')
  })

  it('resolves to error, and sends nothing, when the claim throws', async () => {
    const deps = fakeDeps({ claim: async () => { throw new Error('db down') } })
    await expect(notifyResultsViewed(CLOSED, deps)).resolves.toBe('error')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('resolves to error and takes no claim when the summary cannot be built', async () => {
    const deps = fakeDeps()
    const input: NotifyResultsViewedInput = {
      ...CLOSED,
      buildSummary: () => { throw new Error('bad report') },
    }
    await expect(notifyResultsViewed(input, deps)).resolves.toBe('error')
    expect(deps.claim).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })
})

describe('resultsViewedSummary', () => {
  const areaNames = [
    { id: 'guest', name: 'Guest Experience' },
    { id: 'gov', name: 'Governance / Accountability' },
    { id: 'sys', name: 'Org Structure / Systems' },
  ]

  it('uses the cover score as the overall score and the tier name as the health stage', () => {
    expect(
      resultsViewedSummary({
        churchName: 'Grace Chapel',
        cover: { score: 69, tierName: 'Growth Constrained' },
        areaScores: [],
        areaNames,
      }),
    ).toEqual({ churchName: 'Grace Chapel', overallScore: 69, healthStage: 'Growth Constrained', areas: [] })
  })

  it("lists every area by name and score in the report's order: score high to low, ties by area id", () => {
    const summary = resultsViewedSummary({
      churchName: 'Grace Chapel',
      cover: { score: 69, tierName: 'Growth Constrained' },
      // Input order puts `sys` before `guest`: a stable sort without the id tie-break keeps it there.
      areaScores: [
        { category_id: 'sys', score: 63 },
        { category_id: 'gov', score: 76 },
        { category_id: 'guest', score: 63 },
      ],
      areaNames,
    })
    expect(summary.areas).toEqual([
      { name: 'Governance / Accountability', score: 76 },
      { name: 'Guest Experience', score: 63 },
      { name: 'Org Structure / Systems', score: 63 },
    ])
  })

  it('falls back to the area id when the methodology has no name for it', () => {
    const summary = resultsViewedSummary({
      churchName: 'Grace Chapel',
      cover: { score: 50, tierName: 'Strategic Priority' },
      areaScores: [{ category_id: 'new_area', score: 40 }],
      areaNames,
    })
    expect(summary.areas).toEqual([{ name: 'new_area', score: 40 }])
  })
})
