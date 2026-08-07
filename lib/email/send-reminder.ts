import { Resend } from 'resend'
import { renderBrandedEmail, reminderFrom } from '@/lib/email/layout'

export interface SendReminderArgs {
  to: string
  subject: string
  text: string
}

const PROD_APP_URL = 'https://www.360churchhealthassessment.com'

/** App base URL for the reminder CTA. Reminders carry no per-user deep link, so this points at the
 * app entry (APP_URL in every environment, production fallback otherwise). */
function appUrl(): string {
  return process.env.APP_URL?.trim() || PROD_APP_URL
}

/**
 * Decoupled reminder send, mirroring send-member-invitation's graceful-degradation shape: without
 * RESEND_API_KEY it logs and returns { ok: false } (in-app banners cover the user regardless).
 * From resolves via reminderFrom(): REMINDER_FROM → EMAIL_FROM → Resend's owner-only test address.
 */
export async function sendReminderEmail({ to, subject, text }: SendReminderArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendReminderEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  const { html, text: bodyText } = renderBrandedEmail({
    previewText: text,
    heading: 'A gentle reminder',
    paragraphs: [text],
    cta: { label: 'Open your assessment', url: appUrl() },
  })
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: reminderFrom(),
      to,
      subject,
      html,
      text: bodyText,
    })
    if (error) {
      console.error('sendReminderEmail: Resend returned an error', error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendReminderEmail: send threw', e)
    return { ok: false }
  }
}
