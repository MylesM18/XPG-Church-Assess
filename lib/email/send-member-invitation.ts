import { Resend } from 'resend'
import { roleLabel } from '@/lib/access/accept-state'

export interface SendMemberInvitationArgs {
  to: string
  link: string
  churchName: string
  role: string
}

/**
 * Decoupled send (mirrors sendInvitationEmail). The invitation is already persisted before this
 * is called, so any failure here is soft: log and return { ok: false }; the caller surfaces the
 * copyable link. From-address onboarding@resend.dev only delivers to the Resend account owner
 * locally — everyone else relies on the copyable-link fallback.
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
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
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
