'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function acceptInvitation(token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in to accept.' }

  const { data: churchId, error } = await supabase.rpc('accept_member_invitation', { p_token: token })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/app/${churchId as string}`)
  redirect(`/app/${churchId as string}`) // last statement — NEXT_REDIRECT throws by design
}
