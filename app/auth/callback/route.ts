import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only allow relative redirects — `${origin}${next}` with an absolute or
  // userinfo-bearing `next` (e.g. "@evil.com") would be an open redirect. Also rejects
  // protocol-relative (`//evil.com`) and backslash-protocol-relative (`/\evil.com`)
  // forms, consistent with resolveNext in lib/auth/resolve-next.ts.
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) next = '/'

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
