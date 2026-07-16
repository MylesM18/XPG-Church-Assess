import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { validateCategoryAnswers } from '@/lib/answers/validate'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase = await createClient()

  // Look up the invitation context (anon) to learn the category, and to reject invalid tokens early.
  const { data, error: ctxError } = await supabase.rpc('get_invitation_context', { p_token: token })
  const ctx = Array.isArray(data) ? data[0] : null
  if (ctxError || !ctx || !ctx.valid) {
    return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const { respondent_label, answers } = (body ?? {}) as { respondent_label?: unknown; answers?: unknown }

  const label = typeof respondent_label === 'string' ? respondent_label.trim() : ''
  if (label === '') {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }

  const methodology = loadMethodology()
  const validated = validateCategoryAnswers(ctx.category_id, answers, methodology.questions.categories)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { error } = await supabase.rpc('submit_invited_response', {
    p_token: token,
    p_respondent_label: label,
    p_answers: validated.answers,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
