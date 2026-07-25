'use server'

import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { validateCategoryAnswers, validateSingleAnswer, type AnswerInput } from '@/lib/answers/validate'

export async function submitSelfResponse(
  churchId: string,
  categoryId: string,
  answers: AnswerInput[],
): Promise<{ ok: boolean; error?: string }> {
  const methodology = loadMethodology()
  const validated = validateCategoryAnswers(categoryId, answers, methodology.questions.categories)
  if (!validated.ok) return { ok: false, error: validated.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { error } = await supabase.rpc('submit_self_response', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_answers: validated.answers,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function saveSelfAnswer(
  churchId: string,
  categoryId: string,
  answer: AnswerInput,
): Promise<{ ok: boolean; error?: string }> {
  const methodology = loadMethodology()
  const validated = validateSingleAnswer(categoryId, answer, methodology.questions.categories)
  if (!validated.ok) return { ok: false, error: validated.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  // submit_self_response accepts 1..50 answers and upserts per (run_id, item_id, respondent_user_id),
  // so a single-element array saves/overwrites exactly this one answer.
  const { error } = await supabase.rpc('submit_self_response', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_answers: [validated.answer],
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
