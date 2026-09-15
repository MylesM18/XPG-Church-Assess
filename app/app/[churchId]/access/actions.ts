'use server'

import { revalidatePath } from 'next/cache'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'
import { churchName } from '@/lib/data/churches'
import { removeChurchMember } from '@/lib/data/members'
import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'
import { acceptLink } from '@/lib/access/accept-state'
import { mapRoleInput } from '@/lib/access/roles'
import { prepareInvitedAccount } from '@/lib/auth/invited-account'
import { WINDOW_DAYS, DAY_MS } from '@/lib/deadlines/countdown'

export interface InviteResult {
  link: string | null
  emailed: boolean
  /** The invitee's account was created and bound to this church at invite time (spec 2026-09-14). */
  bound: boolean
  error: string | null
}

export interface ManageResult {
  error: string | null
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export async function inviteMember(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const roleInput = String(formData.get('role') ?? '')
  const role = mapRoleInput(roleInput)

  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { link: null, emailed: false, bound: false, error: authErr }

  const name = await churchName(supabase, churchId)

  const { data: token, error } = await supabase.rpc('create_member_invitation', {
    p_church_id: churchId, p_role: role, p_invited_email: email,
  })
  if (error) return { link: null, emailed: false, bound: false, error: error.message }

  // Invite = account creation. The invitee's auth account and their church_members row are created
  // NOW, before the email goes out, so every way they can enter the app already knows which church
  // is theirs — never "Add your church". The invitation row proves admin authority to the
  // service-role-only bind RPC. Degradation is loud: an unbound result is returned to the form and
  // logged, never swallowed (docs/superpowers/specs/2026-09-14-invite-account-binding-design.md).
  const prepared = await prepareInvitedAccount({ invitationId: token as string, email })
  if (!prepared.bound) {
    console.error('inviteMember: invitation created but the account could not be bound:', prepared.reason)
  }

  const link = acceptLink(APP_URL, token as string)
  const sent = await sendMemberInvitationEmail({
    to: email, link, churchName: name ?? 'your church', role,
  })
  revalidatePath(`/app/${churchId}/access`)
  revalidatePath(`/app/${churchId}`)
  return { link, emailed: sent.ok, bound: prepared.bound, error: null }
}

export async function revokeInvitation(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { error: authErr }
  // Read the bound account before the update: the scoped UPDATE returns no rows, and a revoked
  // invitee must also lose the membership that invite-time binding gave them — otherwise
  // "revoked" would be a label on a person who can still sign in to this church.
  const { data: invite } = await supabase.from('member_invitations')
    .select('invited_user_id')
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
    .maybeSingle()
  // Scoped RLS update (minv_update enforces admin); matches only a still-pending invite → idempotent.
  const { error } = await supabase.from('member_invitations')
    .update({ status: 'revoked' })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  if (error) return { error: error.message }
  if (invite?.invited_user_id) {
    // remove_member is last-admin-guarded server-side and a no-op for a non-member.
    const { error: removeErr } = await removeChurchMember(supabase, churchId, invite.invited_user_id as string)
    if (removeErr) return { error: removeErr }
  }
  revalidatePath(`/app/${churchId}/access`)
  revalidatePath(`/app/${churchId}`)
  return { error: null }
}

export async function removeMember(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { error: authErr }
  // remove_member is last-admin-guarded server-side; surface its refusal message instead of failing silently.
  const { error } = await removeChurchMember(supabase, churchId, userId)
  if (error) return { error }
  revalidatePath(`/app/${churchId}/access`)
  return { error: null }
}

export async function resendInvitation(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { error: authErr }

  // Mirror the invite-window guard: resend bumps expires_at directly (RLS UPDATE), never through
  // create_member_invitation, so the window must be re-checked here. Closed once the earliest invite
  // for this church is older than the window.
  const { data: earliest } = await supabase
    .from('member_invitations')
    .select('created_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (earliest && new Date(earliest.created_at).getTime() < Date.now() - WINDOW_DAYS * DAY_MS) {
    return { error: 'Your 3-day invitation window has closed.' }
  }

  // Re-read the still-pending invite (RLS-scoped SELECT). No expiry filter: Resend deliberately
  // revives a lapsed-but-unrevoked invite, resetting the 14-day clock in the UPDATE below.
  const { data: invite } = await supabase
    .from('member_invitations')
    .select('invited_email, role, invited_user_id')
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
    .maybeSingle()
  if (!invite) return { error: 'This invitation is no longer pending.' }

  // Heal an invitation that has no bound account — created before invite-time binding existed, or
  // one whose binding failed. Resend is the admin's second chance to hand the invitee an account
  // that already belongs to this church. Best-effort; the link below works either way.
  if (!invite.invited_user_id) {
    const prepared = await prepareInvitedAccount({ invitationId: id, email: invite.invited_email })
    if (!prepared.bound) {
      console.error('resendInvitation: could not bind the invited account:', prepared.reason)
    }
  }

  // Bump the 14-day expiry. minv_update gates admin-only with no column restriction, so this
  // scoped UPDATE (same policy revokeInvitation uses) needs no migration.
  const { error: updErr } = await supabase
    .from('member_invitations')
    .update({ expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  if (updErr) return { error: updErr.message }

  // Re-email (best-effort — the pending row already shows the copyable link).
  const name = await churchName(supabase, churchId)
  await sendMemberInvitationEmail({
    to: invite.invited_email,
    link: acceptLink(APP_URL, id),
    churchName: name ?? 'your church',
    role: invite.role,
  })

  revalidatePath(`/app/${churchId}/access`)
  return { error: null }
}

export async function extendMemberDeadline(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { error: authErr }
  // extend_member_deadline is admin-gated + a no-op on untimed members (the founder) server-side.
  const { error } = await supabase.rpc('extend_member_deadline', {
    p_church_id: churchId, p_user_id: userId,
  })
  if (error) return { error: error.message }
  revalidatePath(`/app/${churchId}/access`)
  revalidatePath(`/app/${churchId}`)
  return { error: null }
}
