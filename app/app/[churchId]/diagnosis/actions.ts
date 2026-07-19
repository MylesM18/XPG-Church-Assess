'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { shareLink } from '@/lib/report/share-link'

export interface ShareResult {
  link: string | null
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

export async function shareReport(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { data: token, error } = await supabase.rpc('create_report_share', { p_run_id: runId })
  // The RPC refuses a non-admin and a nonexistent run with the same message on purpose —
  // surface it verbatim rather than saying whether the run exists.
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: shareLink(APP_URL, token as string), error: null }
}

export async function revokeShare(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { error } = await supabase.rpc('revoke_report_share', { p_run_id: runId })
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: null, error: null }
}
