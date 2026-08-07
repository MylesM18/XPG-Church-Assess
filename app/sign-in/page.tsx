'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { LiveStatus } from '@/components/live-status'
import { createClient } from '@/lib/supabase/client'
import { resolveNext } from '@/lib/auth/resolve-next'
import { parseAuthError } from '@/lib/auth/parse-auth-error'

export default function SignInPage() {
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

  // Pre-fill the email when arriving from an accept link (/sign-in?email=…). Display convenience
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

  // Forward the `?next=` the sign-in page was loaded with (e.g. the answer page
  // or the accept-invitation page redirecting here when unauthenticated) through the magic
  // link so /auth/callback lands the user back where they started. Falls back to
  // /get-started for a bare sign-in visit. Open-redirect guarded in resolveNext.
  const callbackUrl = () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : ''
    const next =
      typeof window !== 'undefined'
        ? resolveNext(window.location.search)
        : '/get-started'
    return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
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
        <h1 className="font-display text-3xl text-ink">Welcome back</h1>
        <p className="font-body text-sm text-ink-soft">
          We&rsquo;ll email you a secure sign-in link — no password needed.
        </p>
      </div>

      {sent ? (
        <p ref={sentRef} tabIndex={-1} className="font-body text-ink-soft">
          Check your email for a magic link. You can close this tab.
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
            Send magic link
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
