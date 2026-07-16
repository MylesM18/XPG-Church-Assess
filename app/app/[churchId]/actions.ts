'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/send-invitation'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { diagnose } from '@/lib/engine'
import type { Response } from '@/lib/engine/types'
import { responseHash } from '@/lib/report/response-hash'

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

export async function generateDiagnosis(churchId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const methodology = loadMethodology()
  const categories = methodology.questions.categories

  // HARD GATE (spec §2): never diagnose a partial run — an unanswered category scores 0 → phantom constraint.
  const { data: coverageData, error: coverageError } = await supabase.rpc('get_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) return { ok: false, error: coverageError.message }
  const rows = (coverageData ?? []) as CoverageRow[]
  if (coverage(rows, categories).coveredCount !== categories.length) {
    return { ok: false, error: 'All 8 areas must be answered before generating a diagnosis.' }
  }

  const { data: church } = await supabase
    .from('churches')
    .select('attendance_band')
    .eq('id', churchId)
    .maybeSingle()
  const ctx = { attendance_band: church?.attendance_band ?? '' }

  // Raw per-respondent rows — server-side ONLY, never returned to the browser.
  const { data: raw, error: respError } = await supabase.rpc('get_run_responses', {
    p_church_id: churchId,
  })
  if (respError) return { ok: false, error: respError.message }
  const responses = (raw ?? []) as Response[]

  const diagnosis = diagnose(responses, methodology, ctx)
  const hash = responseHash(responses, diagnosis.methodology_version)

  const { error: saveError } = await supabase.rpc('save_diagnosis', {
    p_church_id: churchId,
    p_response_hash: hash,
    p_methodology_version: diagnosis.methodology_version,
    p_payload: diagnosis,
  })
  if (saveError) return { ok: false, error: saveError.message }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  redirect(`/app/${churchId}/diagnosis`)
}
