import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import {
  RESULTS_VIEWED_TO,
  resultsViewedEmailContent,
  sendResultsViewedEmail,
} from '@/lib/email/send-results-viewed'
import type { ResultsViewedSummary } from '@/lib/notify/results-viewed'

const SUMMARY: ResultsViewedSummary = {
  churchName: 'Grace & Truth Chapel',
  overallScore: 69,
  healthStage: 'Growth Constrained',
  areas: [
    { name: 'Governance / Accountability', score: 76 },
    { name: 'Community / Connection', score: 73 },
    { name: 'Guest Experience', score: 63 },
  ],
}

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  // Restore only the console spies: vi.restoreAllMocks() would also reach the module-level Resend
  // mock above, which every test in this file relies on.
  vi.mocked(console.warn).mockRestore()
  vi.mocked(console.error).mockRestore()
})

describe('resultsViewedEmailContent', () => {
  it('uses the one line as heading and preview, and the same line without its period as the subject', () => {
    const { subject, email } = resultsViewedEmailContent(SUMMARY)
    expect(subject).toBe('Grace & Truth Chapel viewed their assessment results')
    expect(email.heading).toBe('Grace & Truth Chapel viewed their assessment results.')
    expect(email.previewText).toBe('Grace & Truth Chapel viewed their assessment results.')
  })

  it('summarizes the overall score, the health stage, and every area score in the given order', () => {
    expect(resultsViewedEmailContent(SUMMARY).email.paragraphs).toEqual([
      'Overall score: 69 of 100',
      'Health stage: Growth Constrained',
      'Area scores:',
      'Governance / Accountability: 76',
      'Community / Connection: 73',
      'Guest Experience: 63',
    ])
  })

  it('interpolates every value rather than baking any in', () => {
    const { subject, email } = resultsViewedEmailContent({
      churchName: 'Hope Church',
      overallScore: 88,
      healthStage: 'Healthy & Ready',
      areas: [{ name: 'Generosity', score: 91 }],
    })
    expect(subject).toBe('Hope Church viewed their assessment results')
    expect(email.paragraphs).toEqual([
      'Overall score: 88 of 100',
      'Health stage: Healthy & Ready',
      'Area scores:',
      'Generosity: 91',
    ])
  })

  it('has no call-to-action button', () => {
    expect(resultsViewedEmailContent(SUMMARY).email.cta).toBeUndefined()
  })
})

describe('sendResultsViewedEmail', () => {
  it('soft-fails with no API key and never calls Resend', async () => {
    await expect(sendResultsViewedEmail(SUMMARY)).resolves.toEqual({ ok: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends the branded summary to kevin@xpgathering.com and reports ok', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null })
    await expect(sendResultsViewedEmail(SUMMARY)).resolves.toEqual({ ok: true })
    expect(RESULTS_VIEWED_TO).toBe('kevin@xpgathering.com')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0]![0]
    expect(arg.to).toBe('kevin@xpgathering.com')
    expect(arg.subject).toBe('Grace & Truth Chapel viewed their assessment results')
    for (const line of [
      'Grace & Truth Chapel viewed their assessment results.',
      'Overall score: 69 of 100',
      'Health stage: Growth Constrained',
      'Area scores:',
      'Governance / Accountability: 76',
      'Community / Connection: 73',
      'Guest Experience: 63',
    ]) {
      expect(arg.text).toContain(line)
    }
    expect(arg.html).toContain('XP Gathering')
    expect(arg.html).toContain('Grace &amp; Truth Chapel viewed their assessment results.')
    expect(arg.html).not.toContain('Grace & Truth')
  })

  it('sends from EMAIL_FROM when set', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.EMAIL_FROM = 'invites@360churchhealthassessment.com'
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null })
    await sendResultsViewedEmail(SUMMARY)
    expect(sendMock.mock.calls[0]![0].from).toBe('invites@360churchhealthassessment.com')
  })

  it('soft-fails when Resend returns an error', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(sendResultsViewedEmail(SUMMARY)).resolves.toEqual({ ok: false })
  })

  it('soft-fails when the Resend call throws', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockRejectedValue(new Error('network down'))
    await expect(sendResultsViewedEmail(SUMMARY)).resolves.toEqual({ ok: false })
  })

  it('soft-fails once Resend has not answered for 5 seconds, and not a moment sooner', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockReturnValue(new Promise(() => {}))
    let result: { ok: boolean } | undefined
    const pending = sendResultsViewedEmail(SUMMARY).then((r) => {
      result = r
    })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(result).toEqual({ ok: false })
  })

  it('clears its timeout once Resend answers', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null })
    await expect(sendResultsViewedEmail(SUMMARY)).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
