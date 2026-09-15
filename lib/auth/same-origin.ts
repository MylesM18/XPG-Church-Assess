/**
 * Rejects a cross-origin caller — the compensating control for verifying a `token_hash` without
 * PKCE. Shared by the two routes that spend a sign-in token on a POST: `app/auth/confirm/verify`
 * (the emailed link) and `app/accept/[token]/continue` (the invitation's one-click sign-in).
 *
 * `verifyOtp({ token_hash })` has no browser binding. That is deliberate (it is what makes
 * desktop-request → phone-open work), but it also means an attacker can auto-submit their own
 * valid token from their own page and silently sign the visitor into the attacker's account,
 * where that visitor's assessment answers then land. A cross-site urlencoded form POST is
 * CORS-simple, so it is never preflighted away, and `SameSite` governs whether cookies are
 * *sent*, not whether a response may *set* them. `app/auth/callback/route.ts` never needed this:
 * PKCE requires the `code_verifier` cookie in the browser that requested the link.
 *
 * Next.js's built-in Origin/Host check protects Server Actions, not Route Handlers.
 *
 * Fails closed only on positive evidence of a cross-origin request. Browsers always attach
 * `Origin` to a POST, and a form cannot set `x-forwarded-host` or `sec-fetch-site` — adding either
 * via `fetch` would trigger a preflight these routes do not answer.
 */
export function isSameOrigin(request: Request): boolean {
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

  // Exactly the hosts the redirect already trusts, compared as parsed hosts so that
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
