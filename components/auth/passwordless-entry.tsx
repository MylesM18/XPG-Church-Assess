'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { LiveStatus } from '@/components/live-status'
import { createClient } from '@/lib/supabase/client'
import { isInvitePath, resolveNext } from '@/lib/auth/resolve-next'
import { parseAuthError } from '@/lib/auth/parse-auth-error'

// The one thing that varies between /sign-in (returning) and /sign-up (first-time). Everything
// else — OTP send, Google OAuth, redirect guard, error surfacing, prefill, focus — is identical.
export type PasswordlessEntryCopy = {
  heading: string
  greeting: string
  submitLabel: string
  sentMessage: string
}

export function PasswordlessEntry({ copy }: { copy: PasswordlessEntryCopy }) {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentRef = useRef<HTMLParagraphElement>(null)

  // The whole sign-in form unmounts when `sent` flips, taking the focused submit button with it,
  // so focus would otherwise fall to <body>. Moving it to the confirmation announces the text and
  // leaves the keyboard in a sensible place. No heading change needed here — the <h1> already sits
  // outside the `sent` ternary.
  useEffect(() => {
    if (sent) sentRef.current?.focus()
  }, [sent])

  // Pre-fill the email when arriving from an accept link (/sign-up?email=…). Display convenience
  // only — the accept RPC still gates on the exact signed-in email server-side.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hint = new URLSearchParams(window.location.search).get('email')
    // One-time seed from the URL on mount (accept-link email hint), not a derivation
    // from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hint) setEmail(hint)
  }, [])

  // Surface WHY a magic-link / OAuth round-trip failed instead of bouncing here
  // silently. Supabase rejects a dead/expired token by redirecting to the Site URL
  // with the reason in the URL *fragment* (`#…error_code=otp_expired…`), which never
  // reaches the server — so /auth/callback can only redirect back with a reasonless
  // `?error=auth`. Read both channels client-side, then strip the signal from the URL
  // so a refresh (or the next magic-link send) doesn't resurrect a stale error.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const message = parseAuthError(window.location.search, window.location.hash)
    if (!message) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(message)
    const url = new URL(window.location.href)
    url.hash = ''
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.toString())
  }, [])

  // Forward the `?next=` this page was loaded with (e.g. the answer page bouncing to
  // /sign-in, or the accept-invitation page linking to /sign-up when unauthenticated)
  // through the sign-in round-trip so the user lands back where they started. Falls back
  // to /get-started for a bare visit. Open-redirect guarded in resolveNext.
  const currentOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')
  const nextPath = () =>
    typeof window !== 'undefined' ? resolveNext(window.location.search) : '/get-started'

  // Google OAuth only. It is a PKCE code exchange, so it still round-trips through
  // /auth/callback, which is unchanged.
  const callbackUrl = () => `${currentOrigin()}/auth/callback?next=${encodeURIComponent(nextPath())}`

  // Magic link. Supabase renders this value into the email template as `{{ .RedirectTo }}`, and
  // the emailed link carries it to /auth/confirm as `next` — so it must be the REAL destination,
  // not a callback hop. It arrives at the confirm route absolute; `resolveNextFromRedirectTo`
  // reduces it back to a path there.
  const magicLinkRedirectTo = () => {
    const origin = currentOrigin()
    const next = nextPath()
    return `${origin}${next}`
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // `data` lands in auth.users.raw_user_meta_data, which Supabase's email templates read as
    // `{{ .Data }}`. There is exactly ONE "Confirm signup" template for every new account, and it
    // is the admin's onboarding welcome — add your church, invite your leaders, receive your
    // diagnosis — so an invited leader was being handed a checklist that was never theirs
    // (Natalie, 2026-08-19). The template now branches on this flag.
    //
    // Sent UNCONDITIONALLY, true or false, never spread in only on the invite path: Confirm-signup
    // renders once, at account creation, and every account created THROUGH AN EMAILED LINK is
    // created here — so an always-present key means the template's `{{ if .Data.invited }}` is
    // never evaluated against metadata that has no such key. (Google OAuth below also creates
    // accounts and carries no flag; it needs none, because Google asserts email_verified and
    // GoTrue then sends no confirmation email at all. A missing key would read false regardless.)
    //
    // Cosmetic only; the invitation itself is still gated server-side by the accept RPC on the
    // exact signed-in address.
    //
    // Reads nextPath(), not window.location.search: that value is already window-guarded and
    // already through the open-redirect guard, and it is the SAME value emailRedirectTo is built
    // from — so the flag can never disagree with where the email actually lands.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: magicLinkRedirectTo(),
        data: { invited: isInvitePath(nextPath()) },
      },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })
    if (error) setError(error.message)
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col items-start gap-[6px]">
        <Image
          src="/landing/logo-dark.png"
          alt="XP Gathering"
          width={750}
          height={100}
          priority
          className="h-auto w-[180px]"
        />
        <small className="font-body text-[9px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          Church Health
        </small>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink">{copy.heading}</h1>
        <p className="font-body text-sm text-ink-soft">{copy.greeting}</p>
      </div>

      {sent ? (
        <p ref={sentRef} tabIndex={-1} className="font-body text-ink-soft">
          {copy.sentMessage}
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="font-body text-sm text-ink-soft">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {copy.submitLabel}
          </button>
        </form>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-body text-xs text-ink-soft">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="flex items-center justify-center gap-3 rounded-md border border-line bg-paper px-4 py-2 font-body text-ink transition-colors hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
          <path
            fill="#4285F4"
            d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9082c1.7018-1.5668 2.6841-3.874 2.6841-6.6151z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9082-2.2582c-.806.54-1.8368.859-3.0482.859-2.344 0-4.3282-1.5827-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"
          />
          <path
            fill="#EA4335"
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1623 6.656 3.5795 9 3.5795z"
          />
        </svg>
        Continue with Google
      </button>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </main>
  )
}
