import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  resolveAcceptState, resolveAcceptedEntry, roleLabel, type AcceptPreview,
} from '@/lib/access/accept-state'
import { AcceptButton } from './accept-button'
import { AnonymityNote } from '@/components/anonymity-note'
import { LiveStatus } from '@/components/live-status'
import { AutoSubmit } from '@/app/auth/confirm/auto-submit'

const shell = 'mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6'
const button =
  'rounded-md border border-line bg-ink px-4 py-2 text-center font-body text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const textLink =
  'font-body text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// Shared between the <form> and the client component that submits it on mount.
const CONTINUE_FORM_ID = 'accept-continue'

// What the invitee reads when app/accept/[token]/continue/route.ts bounces back with ?error=.
const CONTINUE_FALLBACK_ERROR =
  'We couldn’t sign you in automatically. Use the link below to get a sign-in email instead.'
const CONTINUE_ERRORS: Record<string, string> = {
  invalid:
    'This invitation can no longer sign you in. Ask an admin to resend it, or use your email to sign in below.',
  removed: 'You no longer have access to this church. Ask an admin to invite you again.',
  unavailable: 'One-click sign-in isn’t available right now. Use the link below to get a sign-in email instead.',
  mint: 'One-click sign-in isn’t available right now. Use the link below to get a sign-in email instead.',
}

export default async function AcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const errorParam = typeof sp.error === 'string' ? sp.error : ''
  const continueError: string | null = errorParam
    ? (CONTINUE_ERRORS[errorParam] ?? CONTINUE_FALLBACK_ERROR)
    : null

  const supabase = await createClient()

  const { data: rows } = await supabase.rpc('get_member_invitation_preview', { p_token: token })
  const preview = (rows?.[0] ?? null) as AcceptPreview | null

  const { data: { user } } = await supabase.auth.getUser()
  const state = resolveAcceptState({
    preview, signedIn: !!user, sessionEmail: user?.email ?? null,
  })

  if (state === 'not_found') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Invitation not found</h1>
      <p className="font-body text-ink-soft">This link isn’t valid. Ask whoever invited you for a fresh one.</p></main>
  }

  // preview is guaranteed non-null past this point (resolver returns not_found for null).
  const p = preview!
  const label = roleLabel(p.role)
  // Whether the one-click route has anything to mint with. Without a service-role key the page
  // falls back to the emailed sign-in rather than rendering a form that would fail.
  const oneClick = createServiceRoleClient() !== null

  if (state === 'revoked') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Invitation revoked</h1>
      <p className="font-body text-berry">This invitation was revoked. Ask an admin to invite you again.</p></main>
  }
  if (state === 'accepted') {
    // The link keeps working for its whole 14-day life (owner decision, 2026-09-14): 'accepted' is a
    // roster fact, not the end of the link. Same interstitial as a first visit; the continue route
    // resolves the church id for a returning member (signed in or not), which the anon preview
    // never exposes. Past expiry, or with nothing to mint, the ordinary sign-in takes over — the
    // membership already exists, so that path lands on the church too.
    const entry = resolveAcceptedEntry({
      isExpired: p.is_expired, signedIn: !!user, sessionEmail: user?.email ?? null,
      invitedEmail: p.invited_email, oneClick,
    })
    if (entry === 'go_home') redirect('/get-started')
    if (entry === 'wrong_account') {
      return (
        <main id="main-content" tabIndex={-1} className={shell}>
          <h1 className="font-display text-2xl text-ink">Wrong account</h1>
          <p className="font-body text-berry">You’re signed in as {user!.email}, but this invitation is for {p.invited_email}. Sign out and sign back in as {p.invited_email}.</p>
          <Link href={`/sign-in?email=${encodeURIComponent(p.invited_email)}`} className={textLink}>Go to sign in</Link>
        </main>
      )
    }
    if (entry === 'sign_in_link') {
      return (
        <main id="main-content" tabIndex={-1} className={shell}>
          <h1 className="font-display text-2xl text-ink">Welcome back to {p.church_name}</h1>
          <p className="font-body text-ink-soft">This link can’t sign you in any more, but your assessment is right where you left it. Enter your email and we’ll send you a fresh sign-in link.</p>
          <Link href={`/sign-in?email=${encodeURIComponent(p.invited_email)}`} className={button}>Sign in</Link>
        </main>
      )
    }
    return (
      <ContinueInterstitial
        token={token} oneClick={oneClick} continueError={continueError}
        heading={`Welcome back to ${p.church_name}`}
        intro={`One moment while we sign you in as ${p.invited_email} and take you back to your assessment. If nothing happens, use the button below.`}
      >
        <Link href={`/sign-in?email=${encodeURIComponent(p.invited_email)}`} className={textLink}>Email me a sign-in link instead</Link>
      </ContinueInterstitial>
    )
  }
  if (state === 'expired') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Invitation expired</h1>
      <p className="font-body text-berry">This invitation has expired. Ask an admin for a new one.</p></main>
  }

  if (state === 'sign_in') {
    // Invite = account creation: the invitee's account and membership already exist, so all that is
    // left is a session. Render an inert interstitial that POSTs to /accept/[token]/continue, which
    // mints and spends a sign-in token for the INVITED address — the same GET-renders / POST-spends
    // split as /auth/confirm, so an inbox scanner fetching this URL consumes nothing.
    //
    // The emailed sign-in path (/sign-up, "Glad you're here.") stays one click away as the fallback:
    // it is the whole page when there is no service-role key to mint with, and the way out after a
    // bounce-back error from the continue route.
    const next = encodeURIComponent(`/accept/${token}`)
    const email = encodeURIComponent(p.invited_email)
    return (
      <ContinueInterstitial
        token={token} oneClick={oneClick} continueError={continueError}
        heading={`Join ${p.church_name}`}
        intro={oneClick
          ? `Your account at ${p.church_name} is ready. One moment while we sign you in as ${p.invited_email}. If nothing happens, use the button below.`
          : `You’ve been invited to help lead ${p.church_name} as a ${label}. Sign in as ${p.invited_email} to continue.`}
      >
        <Link href={`/sign-up?next=${next}&email=${email}`} className={oneClick ? textLink : button}>
          {oneClick ? 'Email me a sign-in link instead' : 'Sign in to accept'}
        </Link>
      </ContinueInterstitial>
    )
  }

  if (state === 'wrong_email') {
    // Carries next= for the same reason the signed-out branch above does: it brings them back to
    // THIS invitation after signing in, and — if the correct address is new here — it is what
    // earns them the invited confirm email instead of the admin's onboarding one
    // (lib/auth/resolve-next.ts isInvitePath).
    return (
      <main id="main-content" tabIndex={-1} className={shell}>
        <h1 className="font-display text-2xl text-ink">Wrong account</h1>
        <p className="font-body text-berry">You’re signed in as {user!.email}, but this invitation is for {p.invited_email}. Sign out and sign back in as {p.invited_email}.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(`/accept/${token}`)}&email=${encodeURIComponent(p.invited_email)}`} className={textLink}>Go to sign in</Link>
      </main>
    )
  }

  // state === 'ready' — signed in AS the invited address, so accept on arrival and drop them
  // straight into the assessment. Every terminal/auth branch above has already returned, which is
  // what keeps this safe against email-client link prefetch: Gmail fetches the URL with no session
  // cookie, resolves to 'sign_in', and returns before reaching this line. Never hoist this call
  // above those guards. The authoritative gate remains server-side — accept_member_invitation is
  // security definer and re-checks auth, pending status, expiry and the invited email — so this is
  // a convenience, not a relaxation. On a membership that invite-time binding already created it
  // stamps the still-null completion clock (migration 20260914000100). No revalidatePath: it throws
  // during render, and /app/[churchId] is dynamic so there is nothing cached to invalidate.
  const { data: acceptedChurchId, error: acceptError } = await supabase.rpc(
    'accept_member_invitation',
    { p_token: token },
  )
  // redirect() throws NEXT_REDIRECT by design — must stay outside any try/catch.
  if (!acceptError && acceptedChurchId) redirect(`/app/${acceptedChurchId as string}`)

  // Auto-accept failed. Fall back to the manual button rather than dead-ending, and say why —
  // e.g. the RPC compares the invited email case-SENSITIVELY where resolveAcceptState does not,
  // so a case difference can pass the pre-check and still be refused here.
  return (
    <main id="main-content" tabIndex={-1} className={shell}>
      <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
      <p className="font-body text-ink-soft">Accept your invitation to help lead {p.church_name} as a {label}.</p>
      <LiveStatus
        message={
          acceptError
            ? `We couldn’t accept this automatically: ${acceptError.message}. Use the button below.`
            : null
        }
        tone="error"
        className="font-body text-sm text-berry"
      />
      <AnonymityNote />
      <AcceptButton token={token} />
    </main>
  )
}

/**
 * The one-click sign-in interstitial. Inert on GET; `AutoSubmit` presses the form on mount, the
 * visible button is what a reader sees if the script never runs, and `children` is the fallback
 * link to the emailed sign-in. It must NOT auto-submit when the page was just bounced back with an
 * error, or a failing continue route would loop; and it renders no form at all when there is no
 * service-role key, because the route would have nothing to mint with.
 */
function ContinueInterstitial({
  token, oneClick, continueError, heading, intro, children,
}: {
  token: string
  oneClick: boolean
  continueError: string | null
  heading: string
  intro: string
  children: ReactNode
}) {
  const autoSubmitting = oneClick && !continueError
  return (
    <main id="main-content" tabIndex={-1} className={shell}>
      <h1 className="font-display text-2xl text-ink">{autoSubmitting ? 'Signing you in…' : heading}</h1>
      <p className="font-body text-ink-soft">{intro}</p>
      <LiveStatus message={continueError} tone="error" className="font-body text-sm text-berry" />
      {oneClick && (
        <form id={CONTINUE_FORM_ID} method="post" action={`/accept/${encodeURIComponent(token)}/continue`} className="flex flex-col gap-3">
          <button type="submit" className={button}>Continue</button>
        </form>
      )}
      {children}
      {autoSubmitting && <AutoSubmit formId={CONTINUE_FORM_ID} />}
    </main>
  )
}
