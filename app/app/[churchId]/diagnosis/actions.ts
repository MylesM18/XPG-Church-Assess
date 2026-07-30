'use server'

import { revalidatePath } from 'next/cache'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'
import { shareLink } from '@/lib/report/share-link'

export interface ShareResult {
  link: string | null
  error: string | null
  // Required, not optional, on purpose: revokeShare's success return is otherwise byte-identical
  // to the client's EMPTY initial state, so "revoke succeeded" and "nothing has happened yet" are
  // indistinguishable and unannounceable. Making it required turns an omitted status into a
  // compile error rather than a silent undefined.
  status: 'idle' | 'created' | 'revoked'
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export async function shareReport(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { link: null, error: authErr, status: 'idle' }

  const { data: token, error } = await supabase.rpc('create_report_share', { p_run_id: runId })
  // The RPC refuses a non-admin and a nonexistent run with the same message on purpose —
  // surface it verbatim rather than saying whether the run exists.
  if (error) return { link: null, error: error.message, status: 'idle' }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: shareLink(APP_URL, token as string), error: null, status: 'created' }
}

export async function revokeShare(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { link: null, error: authErr, status: 'idle' }

  const { error } = await supabase.rpc('revoke_report_share', { p_run_id: runId })
  if (error) return { link: null, error: error.message, status: 'idle' }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: null, error: null, status: 'revoked' }
}
