import { Resend } from 'resend'
import { renderBrandedEmail, notificationFrom, type BrandedEmailArgs } from '@/lib/email/layout'
import type { ResultsViewedSummary } from '@/lib/notify/results-viewed'

/** XP Gathering's contact for "a church opened its results" (spec 2026-09-15-results-viewed-email-design.md). */
export const RESULTS_VIEWED_TO = 'kevin@xpgathering.com'

/** The diagnosis page awaits this send on a report's first admin view, so a slow Resend is cut off here. */
export const RESULTS_VIEWED_SEND_TIMEOUT_MS = 5_000

/** Subject plus branded-email args for the results-viewed email. Pure; church-level numbers only. */
export function resultsViewedEmailContent(summary: ResultsViewedSummary): {
  subject: string
  email: BrandedEmailArgs
} {
  const line = `${summary.churchName} viewed their assessment results.`
  return {
    subject: `${summary.churchName} viewed their assessment results`,
    email: {
      previewText: line,
      heading: line,
      paragraphs: [
        `Overall score: ${summary.overallScore} of 100`,
        `Health stage: ${summary.healthStage}`,
        'Area scores:',
        ...summary.areas.map((area) => `${area.name}: ${area.score}`),
      ],
    },
  }
}

/**
 * Sends the results-viewed email to XP Gathering, mirroring send-reminder's graceful-degradation
 * shape: never throws, and returns { ok: false } with no RESEND_API_KEY, on a Resend error, on a
 * throw, or when Resend has not answered within RESULTS_VIEWED_SEND_TIMEOUT_MS.
 */
export async function sendResultsViewedEmail(summary: ResultsViewedSummary): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendResultsViewedEmail: RESEND_API_KEY not set, skipping send, returning soft failure')
    return { ok: false }
  }
  const { subject, email } = resultsViewedEmailContent(summary)
  const { html, text } = renderBrandedEmail(email)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), RESULTS_VIEWED_SEND_TIMEOUT_MS)
  })
  try {
    const resend = new Resend(key)
    const result = await Promise.race([
      resend.emails.send({ from: notificationFrom(), to: RESULTS_VIEWED_TO, subject, html, text }),
      timedOut,
    ])
    if (result === 'timeout') {
      console.error('sendResultsViewedEmail: Resend did not answer in time')
      return { ok: false }
    }
    if (result.error) {
      console.error('sendResultsViewedEmail: Resend returned an error', result.error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendResultsViewedEmail: send threw', e)
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
