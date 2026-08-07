import { Resend } from 'resend'
import { roleLabel } from '@/lib/access/accept-state'
import { renderBrandedEmail, inviteFrom } from '@/lib/email/layout'

export interface SendMemberInvitationArgs {
  to: string
  link: string
  churchName: string
  role: string
}

/**
 * Decoupled send. The invitation is already persisted before this
 * is called, so any failure here is soft: log and return { ok: false }; the caller surfaces the
 * copyable link.
 *
 * From-address resolves via inviteFrom(): INVITE_FROM → EMAIL_FROM → onboarding@resend.dev (Resend's
 * shared test address, which only delivers to the Resend account owner). To reach real members a
 * verified-domain sender must be set; everyone else relies on the copyable link.
 */
export async function sendMemberInvitationEmail(
  { to, link, churchName, role }: SendMemberInvitationArgs,
): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendMemberInvitationEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  const label = roleLabel(role)
  const subject = `You're invited to help lead ${churchName}`
  const { html, text } = renderBrandedEmail({
    previewText: `${churchName} invited you to the 360 Church Health Assessment.`,
    heading: subject,
    paragraphs: [
      `${churchName} has invited you to help lead as a ${label}.`,
      'The 360 Church Health Assessment is a short, guided reflection on your church’s health. Your perspective helps paint the full picture.',
    ],
    cta: { label: 'Accept your invitation', url: link },
    fallbackLinkLabel: 'Or paste this link into your browser:',
  })
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: inviteFrom(),
      to,
      subject,
      html,
      text,
    })
    if (error) {
      console.error('sendMemberInvitationEmail: Resend returned an error', error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendMemberInvitationEmail: send threw', e)
    return { ok: false }
  }
}
