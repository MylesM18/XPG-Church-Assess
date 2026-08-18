'use server'

import { redirect } from 'next/navigation'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { createClient } from '@/lib/supabase/server'
import { createChurchWithAdmin } from '@/lib/data/churches'

export interface CreateChurchState {
  error: string | null
}

const BAND_FIELDS = [
  'denomination',
  'context',
  'attendance_band',
  'adults_band',
  'staff_fte_band',
  'budget_band',
  'church_age_band',
  'growth_trajectory',
] as const

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function createChurch(
  _prev: CreateChurchState,
  formData: FormData,
): Promise<CreateChurchState> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Church name is required.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-up?next=/get-started')

  const brand = resolveBrand(name)
  const methodology = loadMethodology()

  const args: Record<string, string | null> = {
    p_name: name,
    p_brand_color: brand.tileColor,
    p_methodology_version: methodology.questions.version,
  }
  for (const field of BAND_FIELDS) {
    args[`p_${field}`] = emptyToNull(formData.get(field))
  }

  const { churchId, error } = await createChurchWithAdmin(supabase, args)
  if (error) return { error }
  if (!churchId) return { error: 'Church creation failed — no id returned.' }

  redirect(`/app/${churchId}`)
}
