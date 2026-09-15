import { createHash } from 'node:crypto'
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

/** The exact message handed to Resend. */
export interface ResultsViewedMessage {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Resend idempotency key for one run's email. Resend returns the original result without sending again
 * when a key is reused with identical content within 24 hours, so a retry after a send that timed out but
 * was accepted, or whose mark failed, is not delivered twice. The content digest gives a CHANGED message
 * (for example after EMAIL_FROM is fixed following a failed attempt) a new key, instead of Resend's 409
 * "key already used with a different payload", which would block it. Well under Resend's 256-character
 * limit for a uuid run id.
 */
export function resultsViewedIdempotencyKey(runId: string, message: ResultsViewedMessage): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([message.from, message.to, message.subject, message.html, message.text]))
    .digest('hex')
    .slice(0, 32)
  return `results-viewed-email/${runId}/${digest}`
}

/**
 * Sends the results-viewed email to XP Gathering, mirroring send-reminder's graceful-degradation
 * shape: never throws, and returns { ok: false } with no RESEND_API_KEY, on a Resend error, on a
 * throw, or when Resend has not answered within RESULTS_VIEWED_SEND_TIMEOUT_MS. `runId` keys the Resend
 * idempotency key, so a retried identical message is never delivered twice.
 */
export async function sendResultsViewedEmail(
  summary: ResultsViewedSummary,
  runId: string,
): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendResultsViewedEmail: RESEND_API_KEY not set, skipping send, returning soft failure')
    return { ok: false }
  }
  const { subject, email } = resultsViewedEmailContent(summary)
  const { html, text } = renderBrandedEmail(email)
  const message: ResultsViewedMessage = { from: notificationFrom(), to: RESULTS_VIEWED_TO, subject, html, text }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), RESULTS_VIEWED_SEND_TIMEOUT_MS)
  })
  try {
    const resend = new Resend(key)
    const result = await Promise.race([
      resend.emails.send(message, { idempotencyKey: resultsViewedIdempotencyKey(runId, message) }),
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
