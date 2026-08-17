import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveNextFromRedirectTo } from '@/lib/auth/resolve-next'

/**
 * Spends the emailed one-time token and starts the session.
 *
 * **POST only, deliberately.** The GET interstitial at `app/auth/confirm/page.tsx` renders the
 * emailed parameters as a form and submits it; prefetchers issue GETs and never reach here, so
 * the token survives until a browser actually runs the page. Adding a GET export would undo the
 * entire defence.
 *
 * `next` arrives as an **absolute** URL — Supabase's template can only express the destination as
 * `{{ .RedirectTo }}`, the rendered `emailRedirectTo`. `resolveNext` rejects absolute values, which
 * would send every emailed sign-in to `/get-started` and cost invited members their
 * `/accept-invitation/<token>` deep link, so this uses the sibling resolver. Both share one
 * open-redirect guard: the host is discarded, never honoured.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const form = await request.formData()

  const tokenHash = form.get('token_hash')
  const type = form.get('type')

  // Re-encode as a query string so the shared resolver stays the single entry point for the
  // guard, rather than growing a second signature that takes a bare value.
  const carrier = new URLSearchParams()
  const rawNext = form.get('next')
  if (typeof rawNext === 'string') carrier.set('next', rawNext)
  const next = resolveNextFromRedirectTo(carrier.toString())

  if (typeof tokenHash === 'string' && tokenHash && typeof type === 'string' && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) {
      // Behind a load balancer the real host is in x-forwarded-host; in local dev `origin` is
      // authoritative. Mirrors app/auth/callback/route.ts so the two flows cannot drift apart.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      // 303 See Other, not the 307 default: this is a form POST, and a method-preserving
      // redirect would make the browser re-POST the token at the destination page.
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`, 303)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`, 303)
      } else {
        return NextResponse.redirect(`${origin}${next}`, 303)
      }
    }
  }

  // Every failure — missing field, expired token, wrong type — lands on the one error channel
  // `lib/auth/parse-auth-error.ts` already reads. No second error surface.
  return NextResponse.redirect(`${origin}/sign-in?error=auth`, 303)
}
