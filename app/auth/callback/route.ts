import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveNext } from '@/lib/auth/resolve-next'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { searchParams, origin } = url
  const code = searchParams.get('code')
  // Single source of truth for both the open-redirect guard and the fallback destination.
  // `${origin}${next}` with an absolute or userinfo-bearing `next` (e.g. "@evil.com") would be
  // an open redirect, as would protocol-relative (`//evil.com`) and backslash forms — resolveNext
  // rejects all three. Its default fallback is `/get-started`, NOT `/`: a member who reaches the
  // callback without a `next` (e.g. a plain sign-in, or a redirect that lost the param) must be
  // routed onward — /get-started forwards a returning member to /app/{churchId} — rather than
  // dumped on the marketing landing page with a live session and nowhere to go.
  const next = resolveNext(url.search)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Behind a load balancer the real host is in x-forwarded-host; in local
      // dev `origin` is authoritative. (Canonical @supabase/ssr callback.)
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`)
}
