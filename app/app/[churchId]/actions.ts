'use server'

import { redirect } from 'next/navigation'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/send-invitation'

export interface InviteResult {
  link: string | null
  emailed: boolean
  error: string | null
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export async function createInvitation(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const invitedName = String(formData.get('invited_name') ?? '').trim() || null
  const invitedContact = String(formData.get('invited_contact') ?? '').trim() || null

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === categoryId)
  if (!category) return { link: null, emailed: false, error: 'Please choose a valid category.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/sign-in?next=/app/${churchId}`)

  const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()

  const { data: token, error } = await supabase.rpc('create_invitation', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_invited_name: invitedName,
    p_invited_contact: invitedContact,
    p_channel: 'email',
  })
  if (error) return { link: null, emailed: false, error: error.message }

  const link = `${APP_URL}/respond/${token as string}`

  let emailed = false
  if (invitedContact) {
    const sent = await sendInvitationEmail({ to: invitedContact, link, churchName: church?.name ?? 'your church' })
    emailed = sent.ok
  }

  return { link, emailed, error: null }
}
