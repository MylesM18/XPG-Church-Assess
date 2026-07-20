'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { createClient } from '@/lib/supabase/client'
import { resolveNext } from '@/lib/auth/resolve-next'

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

  // Forward the `?next=` the sign-in page was loaded with (e.g. the answer page
  // or createInvitation redirect here when unauthenticated) through the magic
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
      <h1 className="font-display text-3xl text-ink">Sign in to XP Gathering</h1>

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
        className="rounded-md border border-line bg-paper px-4 py-2 font-body text-ink transition-colors hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Continue with Google
      </button>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </main>
  )
}
