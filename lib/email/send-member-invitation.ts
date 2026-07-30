import { Resend } from 'resend'
import { roleLabel } from '@/lib/access/accept-state'

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
 * From-address is EMAIL_FROM (an address on a domain verified in Resend, e.g.
 * invites@360churchhealthassessment.com). It falls back to onboarding@resend.dev — Resend's
 * shared test address, which only delivers to the Resend account owner, so to reach real members
 * EMAIL_FROM must be set to a verified-domain address. Everyone else relies on the copyable link.
 */
const DEFAULT_FROM = 'onboarding@resend.dev'
export async function sendMemberInvitationEmail(
  { to, link, churchName, role }: SendMemberInvitationArgs,
): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendMemberInvitationEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  const label = roleLabel(role)
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `You're invited to help lead ${churchName}`,
      html: `<p>${churchName} has invited you to help lead as a ${label}.</p>
             <p><a href="${link}">Accept your invitation</a></p>
             <p>Or paste this link into your browser:<br>${link}</p>`,
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
