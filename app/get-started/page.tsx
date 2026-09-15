import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { pickMemberChurch } from '@/lib/auth/pick-member-church'
import { settleInvitations } from '@/lib/auth/invited-account'
import { GetStartedForm } from './form'

export default async function GetStartedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Unauthenticated visitors are first-time by default (BEGIN THE ASSESSMENT → lands here), so
  // send them to the first-time entry page. Returning members are unharmed: /sign-up runs the same
  // passwordless flow and lands them back here, where the membership check below takes over.
  if (!user) redirect('/sign-up?next=/get-started')

  // A returning member already belongs to a church — route them to their assessment
  // dashboard instead of the church-creation form. This covers both the bare sign-in
  // default (next=/get-started) and a direct visit here. Ordered by created_at so a
  // multi-church member lands deterministically on their earliest church. A failed or
  // empty read simply falls through to the create form (no worse than before).
  // Invite = account creation (spec 2026-09-14): an invitee already holds a membership, and a
  // legacy pending invitation addressed to this e-mail is bound here on the spot, so the check
  // below finds a church for anyone who was ever invited. Idempotent and best-effort.
  await settleInvitations(supabase)

  const { data: memberships } = await supabase
    .from('church_members')
    .select('church_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  const target = pickMemberChurch(memberships ?? [])
  if (target) redirect(`/app/${target}`)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Add your church</h1>
      <p className="font-body text-ink-soft">
        The name and your weekend attendance are all we need to start — everything else is
        optional and editable later.
      </p>
      <GetStartedForm />
    </main>
  )
}
