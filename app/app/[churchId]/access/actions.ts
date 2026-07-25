'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'
import { acceptLink } from '@/lib/access/accept-state'
import { mapRoleInput } from '@/lib/access/roles'

export interface InviteResult {
  link: string | null
  emailed: boolean
  error: string | null
}

export interface ManageResult {
  error: string | null
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

async function requireAdmin(churchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'You must be signed in.' as const }
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user.id).maybeSingle()
  if (membership?.role !== 'admin') return { supabase, error: 'You must be an admin of this church.' as const }
  return { supabase, error: null }
}

export async function inviteMember(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const roleInput = String(formData.get('role') ?? '')
  const role = mapRoleInput(roleInput)

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, emailed: false, error: authErr }

  const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()

  const { data: token, error } = await supabase.rpc('create_member_invitation', {
    p_church_id: churchId, p_role: role, p_invited_email: email,
  })
  if (error) return { link: null, emailed: false, error: error.message }

  const link = acceptLink(APP_URL, token as string)
  const sent = await sendMemberInvitationEmail({
    to: email, link, churchName: church?.name ?? 'your church', role,
  })
  revalidatePath(`/app/${churchId}/access`)
  revalidatePath(`/app/${churchId}`)
  return { link, emailed: sent.ok, error: null }
}

export async function revokeInvitation(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { error: authErr }
  // Scoped RLS update (minv_update enforces admin); matches only a still-pending invite → idempotent.
  const { error } = await supabase.from('member_invitations')
    .update({ status: 'revoked' })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  if (error) return { error: error.message }
  revalidatePath(`/app/${churchId}/access`)
  return { error: null }
}

export async function removeMember(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { error: authErr }
  // remove_member is last-admin-guarded server-side; surface its refusal message instead of failing silently.
  const { error } = await supabase.rpc('remove_member', { p_church_id: churchId, p_user_id: userId })
  if (error) return { error: error.message }
  revalidatePath(`/app/${churchId}/access`)
  return { error: null }
}

export async function resendInvitation(_prev: ManageResult, formData: FormData): Promise<ManageResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { error: authErr }

  // Re-read the still-pending, not-yet-expired invite (RLS-scoped SELECT).
  const { data: invite } = await supabase
    .from('member_invitations')
    .select('invited_email, role')
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!invite) return { error: 'This invitation is no longer pending.' }

  // Bump the 14-day expiry. minv_update gates admin-only with no column restriction, so this
  // scoped UPDATE (same policy revokeInvitation uses) needs no migration.
  const { error: updErr } = await supabase
    .from('member_invitations')
    .update({ expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  if (updErr) return { error: updErr.message }

  // Re-email (best-effort — the pending row already shows the copyable link).
  const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()
  await sendMemberInvitationEmail({
    to: invite.invited_email,
    link: acceptLink(APP_URL, id),
    churchName: church?.name ?? 'your church',
    role: invite.role,
  })

  revalidatePath(`/app/${churchId}/access`)
  return { error: null }
}
