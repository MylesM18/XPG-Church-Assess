'use client'

import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'
import { submitSelfResponse } from './actions'

export function SelfForm({
  churchId,
  categoryId,
  categoryName,
  items,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  items: AnswerFormItem[]
}) {
  async function onSubmit(answers: AnswerInput[]) {
    return submitSelfResponse(churchId, categoryId, answers)
  }
  return <AnswerForm categoryName={categoryName} items={items} requireName={false} onSubmit={onSubmit} />
}
