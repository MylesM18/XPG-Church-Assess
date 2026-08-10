'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  loadChurchForMember,
  updateChurchProfile,
  type ChurchProfileUpdate,
} from '@/lib/data/churches'

export interface SettingsState {
  error: string | null
  saved: boolean
}

// Same normalization the get-started flow applies: whitespace-only posts become NULL so
// the report's "omit gracefully when empty" check (locked decision 6) is a simple null test.
function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

export async function updateChurchSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in.', saved: false }

  const rawChurchId = formData.get('church_id')
  const churchId = typeof rawChurchId === 'string' ? rawChurchId : ''

  // Explicit admin check BEFORE the write: churches_update RLS would make a non-admin's
  // UPDATE match zero rows and report success — this turns that silent no-op into an error.
  const { church, role } = await loadChurchForMember(supabase, churchId, user.id)
  if (!church || role !== 'admin') {
    return { error: 'Only church admins can edit settings.', saved: false }
  }

  // The 12 editable profile columns, explicitly — name/id are never editable here (name is
  // set at creation; the spec scopes settings to profile intake). Explicit keys keep this
  // fully typed against ChurchProfileUpdate with no index-signature gymnastics.
  const fields: ChurchProfileUpdate = {
    denomination: emptyToNull(formData.get('denomination')),
    context: emptyToNull(formData.get('context')),
    attendance_band: emptyToNull(formData.get('attendance_band')),
    adults_band: emptyToNull(formData.get('adults_band')),
    staff_fte_band: emptyToNull(formData.get('staff_fte_band')),
    budget_band: emptyToNull(formData.get('budget_band')),
    church_age_band: emptyToNull(formData.get('church_age_band')),
    growth_trajectory: emptyToNull(formData.get('growth_trajectory')),
    campuses_band: emptyToNull(formData.get('campuses_band')),
    facility_status: emptyToNull(formData.get('facility_status')),
    leadership_history: emptyToNull(formData.get('leadership_history')),
    consultant_notes: emptyToNull(formData.get('consultant_notes')),
  }

  // The diagnosis engine keys cohort percentiles by attendance band — never null it out.
  if (!fields.attendance_band) return { error: 'Weekend attendance is required.', saved: false }

  const { error } = await updateChurchProfile(supabase, churchId, fields)
  if (error) return { error, saved: false }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/settings`)
  return { error: null, saved: true }
}
