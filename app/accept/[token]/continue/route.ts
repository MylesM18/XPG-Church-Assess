import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isSameOrigin } from '@/lib/auth/same-origin'
import { mintSignInToken, settleInvitations } from '@/lib/auth/invited-account'

/**
 * The POST half of an invitation's one-click sign-in
 * (docs/superpowers/specs/2026-09-14-invite-account-binding-design.md).
 *
 * The invitee's account and membership already exist — the invite server action created both.
 * All that is left is a session. The GET interstitial at `app/accept/[token]/page.tsx` renders a
 * form aimed here and submits it on mount; this route validates the invitation, mints a sign-in
 * token for the INVITED address (never one the caller supplies), spends it in the caller's own
 * cookie-bound client, settles the invitation, and lands them on the church.
 *
 * **POST only, deliberately** — the same prefetch defence as `app/auth/confirm/verify/route.ts`:
 * inbox scanners fetch links with GET and never reach here, so an unopened invitation is not
 * consumed by a scanner.
 *
 * **Provenance first** — `verifyOtp({ token_hash })` has no browser binding, so a cross-site
 * auto-submitting form could otherwise sign a visitor into the invitee's account (login-CSRF).
 * `isSameOrigin` is the shared compensating control.
 *
 * **Why the token is minted here and not emailed** — Supabase's OTP expiry (one hour by default)
 * would kill an emailed token long before most volunteers open the message. Minting on click
 * means the only long-lived secret is the invitation id the app already emails: 14-day expiry,
 * admin-revocable, and single-acceptance (settle flips it to `accepted`, after which this route
 * refuses it and the page points at the ordinary sign-in).
 *
 * Every failure bounces back to the accept page with a reason; that page shows the message and
 * the pre-existing "Sign in to accept" fallback instead of auto-submitting again.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { origin } = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  // Mirrors app/auth/callback/route.ts: behind a load balancer the real host is in
  // x-forwarded-host; in local dev `origin` is authoritative.
  const base = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin
  const acceptPath = `/accept/${encodeURIComponent(token)}`
  // 303 See Other on every redirect: this is a form POST, and a method-preserving 307 would make
  // the browser re-POST at the destination.
  const bounce = (reason: string) =>
    NextResponse.redirect(`${base}${acceptPath}?error=${reason}`, 303)

  // Before anything is minted, let alone spent.
  if (!isSameOrigin(request)) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`, 303)
  }
  if (!UUID.test(token)) return bounce('invalid')

  const admin = createServiceRoleClient()
  if (!admin) return bounce('unavailable')

  // The row is default-deny under RLS and the visitor has no session yet, so this read needs the
  // service role. Same gates as accept_member_invitation: pending and unexpired.
  const { data: invitation } = await admin
    .from('member_invitations')
    .select('church_id, invited_email, status, expires_at')
    .eq('id', token)
    .maybeSingle()
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    new Date(invitation.expires_at as string).getTime() < Date.now()
  ) {
    return bounce('invalid')
  }

  const minted = await mintSignInToken(admin, invitation.invited_email as string)
  if (!minted) return bounce('mint')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: minted.type, token_hash: minted.tokenHash })
  if (error) return bounce('verify')

  // Marks the invitation accepted and stamps the 3-day completion clock. Best-effort by design:
  // the session already exists, and the church dashboard is the right place to land either way.
  await settleInvitations(supabase)

  return NextResponse.redirect(`${base}/app/${invitation.church_id as string}`, 303)
}
