'use client'

import { useRouter } from 'next/navigation'
import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'
import { saveSelfAnswer } from './actions'

export function SelfForm({
  churchId,
  categoryId,
  categoryName,
  items,
  initialValues,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  items: AnswerFormItem[]
  initialValues: Record<string, number>
}) {
  const router = useRouter()
  async function onSaveAnswer(answer: AnswerInput) {
    return saveSelfAnswer(churchId, categoryId, answer)
  }
  function onComplete() {
    router.push(`/app/${churchId}`)
  }
  return (
    <AnswerForm
      categoryName={categoryName}
      items={items}
      initialValues={initialValues}
      onSaveAnswer={onSaveAnswer}
      onComplete={onComplete}
    />
  )
}
