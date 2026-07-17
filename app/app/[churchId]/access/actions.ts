'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'
import { acceptLink } from '@/lib/access/accept-state'

export interface InviteResult {
  link: string | null
  emailed: boolean
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
  const role = roleInput === 'Co-admin' ? 'admin' : roleInput === 'Viewer' ? 'viewer' : roleInput

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
  return { link, emailed: sent.ok, error: null }
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error } = await requireAdmin(churchId)
  if (error) return
  // Scoped RLS update (minv_update enforces admin); matches only a still-pending invite → idempotent.
  await supabase.from('member_invitations')
    .update({ status: 'revoked' })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  revalidatePath(`/app/${churchId}/access`)
}

export async function removeMember(formData: FormData): Promise<void> {
  const churchId = String(formData.get('church_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const { supabase, error } = await requireAdmin(churchId)
  if (error) return
  await supabase.rpc('remove_member', { p_church_id: churchId, p_user_id: userId })
  revalidatePath(`/app/${churchId}/access`)
}
