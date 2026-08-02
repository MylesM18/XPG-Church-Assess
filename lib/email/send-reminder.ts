import { Resend } from 'resend'

export interface SendReminderArgs {
  to: string
  subject: string
  text: string
}

/**
 * Decoupled reminder send, mirroring send-member-invitation's graceful-degradation shape: without
 * RESEND_API_KEY it logs and returns { ok: false } (in-app banners cover the user regardless). From
 * is EMAIL_FROM (a verified-domain address) falling back to Resend's owner-only test address.
 */
const DEFAULT_FROM = 'onboarding@resend.dev'
export async function sendReminderEmail({ to, subject, text }: SendReminderArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendReminderEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html: `<p>${text}</p>`,
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
