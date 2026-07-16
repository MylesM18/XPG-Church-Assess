'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = () =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=/get-started`
      : '/auth/callback?next=/get-started'

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="font-display text-3xl text-ink">Sign in to Cairn</h1>

      {sent ? (
        <p className="font-body text-ink-soft">
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
            className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90"
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

      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </main>
  )
}
