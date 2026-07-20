import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteMemberForm } from './invite-member-form'
import { MembersList, type Member } from './members-list'
import { PendingInvitesList, type PendingInvite } from './pending-invites-list'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export default async function AccessPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church } = await supabase
    .from('churches').select('id, name').eq('id', churchId).maybeSingle()
  if (!church) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user?.id ?? '').maybeSingle()
  if (membership?.role !== 'admin') notFound()

  const { data: memberRows } = await supabase.rpc('get_church_members', { p_church_id: churchId })
  const members = (memberRows ?? []) as Member[]

  const { data: pendingRows } = await supabase
    .from('member_invitations')
    .select('id, invited_email, role, status, expires_at, created_at')
    .eq('church_id', churchId).eq('status', 'pending')
    .order('created_at', { ascending: false })
  const pending = (pendingRows ?? []) as PendingInvite[]

  const admins = members.filter((m) => m.role === 'admin')
  const disableRemoveFor = admins.length <= 1 ? (admins[0]?.user_id ?? null) : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/app/${churchId}`} className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">← Back to {church.name}</Link>
        <h1 className="font-display text-2xl text-ink">Manage access</h1>
      </header>

      <InviteMemberForm churchId={churchId} />
      <MembersList churchId={churchId} members={members} currentUserId={user?.id ?? null} disableRemoveFor={disableRemoveFor} />
      <PendingInvitesList churchId={churchId} invites={pending} appUrl={APP_URL} />
    </main>
  )
}
