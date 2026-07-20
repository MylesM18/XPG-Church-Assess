import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveAcceptState, roleLabel, type AcceptPreview } from '@/lib/access/accept-state'
import { AcceptButton } from './accept-button'

const shell = 'mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6'

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
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
  if (state === 'revoked') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Invitation revoked</h1>
      <p className="font-body text-berry">This invitation was revoked. Ask an admin to invite you again.</p></main>
  }
  if (state === 'accepted') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Already accepted</h1>
      <p className="font-body text-ink-soft">You’ve already accepted this invitation.</p>
      <Link href="/app" className="font-body text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Go to your churches</Link></main>
  }
  if (state === 'expired') {
    return <main id="main-content" tabIndex={-1} className={shell}><h1 className="font-display text-2xl text-ink">Invitation expired</h1>
      <p className="font-body text-berry">This invitation has expired. Ask an admin for a new one.</p></main>
  }

  // preview is guaranteed non-null past this point (resolver returns terminal states for null).
  const p = preview!
  const label = roleLabel(p.role)

  if (state === 'sign_in') {
    const next = encodeURIComponent(`/accept/${token}`)
    const email = encodeURIComponent(p.invited_email)
    return (
      <main id="main-content" tabIndex={-1} className={shell}>
        <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
        <p className="font-body text-ink-soft">You’ve been invited to help lead {p.church_name} as a {label}. Sign in as {p.invited_email} to accept.</p>
        <Link href={`/sign-in?next=${next}&email=${email}`}
          className="rounded-md border border-line bg-ink px-4 py-2 text-center font-body text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          Sign in to accept
        </Link>
      </main>
    )
  }

  if (state === 'wrong_email') {
    return (
      <main id="main-content" tabIndex={-1} className={shell}>
        <h1 className="font-display text-2xl text-ink">Wrong account</h1>
        <p className="font-body text-berry">You’re signed in as {user!.email}, but this invitation is for {p.invited_email}. Sign out and sign back in as {p.invited_email}.</p>
        <Link href="/sign-in" className="font-body text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Go to sign in</Link>
      </main>
    )
  }

  // state === 'ready'
  return (
    <main id="main-content" tabIndex={-1} className={shell}>
      <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
      <p className="font-body text-ink-soft">Accept your invitation to help lead {p.church_name} as a {label}.</p>
      <AcceptButton token={token} />
    </main>
  )
}
