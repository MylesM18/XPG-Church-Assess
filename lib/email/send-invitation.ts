import { Resend } from 'resend'

export interface SendInvitationArgs {
  to: string
  link: string
  churchName: string
}

/**
 * Decoupled send (Decision 4). The invitation is already persisted before this is called, so any
 * failure here is soft: log and return { ok: false }; the caller surfaces the copyable link.
 * From-address onboarding@resend.dev works locally without domain verification.
 */
export async function sendInvitationEmail({ to, link, churchName }: SendInvitationArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendInvitationEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject: `You're invited to help assess ${churchName}`,
      html: `<p>${churchName} has invited you to answer a short set of questions.</p>
             <p><a href="${link}">Open your questions</a></p>
             <p>Or paste this link into your browser:<br>${link}</p>`,
    })
    if (error) {
      console.error('sendInvitationEmail: Resend returned an error', error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendInvitationEmail: send threw', e)
    return { ok: false }
  }
}
