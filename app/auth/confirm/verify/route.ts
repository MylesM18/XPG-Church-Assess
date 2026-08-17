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
/**
 * Rejects a cross-origin caller — the compensating control for dropping PKCE.
 *
 * `verifyOtp({ token_hash })` has no browser binding. That is deliberate (it is what makes
 * desktop-request → phone-open work), but it also means an attacker can auto-submit their own
 * valid `token_hash` from their own page and silently sign the visitor into the attacker's
 * account, where that visitor's assessment answers then land. A cross-site urlencoded form POST
 * is CORS-simple, so it is never preflighted away, and `SameSite` governs whether cookies are
 * *sent*, not whether a response may *set* them. `app/auth/callback/route.ts` never needed this:
 * PKCE requires the `code_verifier` cookie in the browser that requested the link.
 *
 * Next.js's built-in Origin/Host check protects Server Actions, not Route Handlers.
 *
 * Fails closed only on positive evidence of a cross-origin request. Browsers always attach
 * `Origin` to a POST, and a form cannot set `x-forwarded-host` or `sec-fetch-site` — adding either
 * via `fetch` would trigger a preflight this route does not answer.
 */
function isSameOrigin(request: Request): boolean {
  const originHeader = request.headers.get('origin')
  if (!originHeader) {
    // Absent Origin is not a browser form POST. Sec-Fetch-Site is the only other signal, and
    // Safari omitted it for years, so its absence cannot be read as hostile.
    return request.headers.get('sec-fetch-site') !== 'cross-site'
  }

  let originHost: string
  try {
    originHost = new URL(originHeader).host
  } catch {
    return false
  }

  // Exactly the hosts the redirect below already trusts, compared as parsed hosts so that
  // evil-360churchhealthassessment.com cannot pass a substring test.
  const ourHosts = new Set(
    [
      request.headers.get('x-forwarded-host'),
      request.headers.get('host'),
      new URL(request.url).host,
    ].filter((host): host is string => Boolean(host)),
  )
  return ourHosts.has(originHost)
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url)

  // Before the token is read, let alone spent.
  if (!isSameOrigin(request)) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`, 303)
  }

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
