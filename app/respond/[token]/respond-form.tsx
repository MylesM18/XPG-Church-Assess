'use client'

import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'

export function RespondForm({
  token,
  categoryName,
  items,
}: {
  token: string
  categoryName: string
  items: AnswerFormItem[]
}) {
  async function onSubmit(answers: AnswerInput[], respondentLabel: string | null) {
    const res = await fetch(`/api/respond/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ respondent_label: respondentLabel, answers }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: body.error ?? 'Submission failed.' }
  }

  return <AnswerForm categoryName={categoryName} items={items} requireName onSubmit={onSubmit} />
}
