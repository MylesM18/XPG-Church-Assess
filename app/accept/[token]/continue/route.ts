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
 * **The link works for its whole 14-day life** (owner decision, 2026-09-14): an invitation that is
 * already `accepted` still signs its invitee in, as long as it is unexpired, not revoked, and the
 * person is still a member — an admin who removed them has closed this door too. `pending` needs no
 * membership check: settle creates the membership.
 *
 * **POST only, deliberately** — the same prefetch defence as `app/auth/confirm/verify/route.ts`:
 * inbox scanners fetch links with GET and never reach here.
 *
 * **Provenance first** — `verifyOtp({ token_hash })` has no browser binding, so a cross-site
 * auto-submitting form could otherwise sign a visitor into the invitee's account (login-CSRF).
 * `isSameOrigin` is the shared compensating control.
 *
 * **Why the token is minted here and not emailed** — Supabase's OTP expiry (one hour by default)
 * would kill an emailed token long before most volunteers open the message. Minting on click
 * means the only long-lived secret is the invitation id the app already emails.
 *
 * A caller already signed in as the invited address skips the minting entirely: nothing to prove,
 * just settle and go — this is how the page resolves the church id for a returning member without
 * the anon preview ever exposing it.
 *
 * Every failure bounces back to the accept page with a reason; that page shows the message and a
 * fallback instead of auto-submitting again.
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

  // The row is default-deny under RLS and the visitor may have no session, so this read needs the
  // service role. Live = pending or accepted (the link keeps working after acceptance), unexpired,
  // never revoked.
  const { data: invitation } = await admin
    .from('member_invitations')
    .select('church_id, invited_email, status, expires_at')
    .eq('id', token)
    .maybeSingle()
  const status = invitation?.status as string | undefined
  if (
    !invitation ||
    (status !== 'pending' && status !== 'accepted') ||
    new Date(invitation.expires_at as string).getTime() < Date.now()
  ) {
    return bounce('invalid')
  }
  const churchId = invitation.church_id as string
  const invitedEmail = invitation.invited_email as string

  const supabase = await createClient()
  const { data: { user: sessionUser } } = await supabase.auth.getUser()
  const alreadySignedIn =
    !!sessionUser && (sessionUser.email ?? '').toLowerCase() === invitedEmail.toLowerCase()

  let userId: string | null = alreadySignedIn ? sessionUser!.id : null
  let minted: Awaited<ReturnType<typeof mintSignInToken>> = null
  if (!alreadySignedIn) {
    minted = await mintSignInToken(admin, invitedEmail)
    if (!minted) return bounce('mint')
    userId = minted.userId
  }

  // An accepted invitation whose member was since removed must not open the church again.
  if (status === 'accepted') {
    const { data: membership } = await admin
      .from('church_members')
      .select('user_id')
      .eq('church_id', churchId)
      .eq('user_id', userId ?? '')
      .maybeSingle()
    if (!membership) return bounce('removed')
  }

  if (minted) {
    const { error } = await supabase.auth.verifyOtp({ type: minted.type, token_hash: minted.tokenHash })
    if (error) return bounce('verify')
  }

  // Marks a pending invitation accepted and stamps the 3-day completion clock; a no-op on a
  // returning member. Best-effort by design: the session exists, and the church dashboard is the
  // right place to land either way.
  await settleInvitations(supabase)

  return NextResponse.redirect(`${base}/app/${churchId}`, 303)
}
