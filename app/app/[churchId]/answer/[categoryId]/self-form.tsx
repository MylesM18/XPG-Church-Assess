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
  initialReflections,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  items: AnswerFormItem[]
  initialValues: Record<string, number>
  initialReflections?: Record<string, string>
}) {
  const router = useRouter()
  async function onSaveAnswer(answer: AnswerInput) {
    return saveSelfAnswer(churchId, categoryId, answer)
  }
  function onComplete() {
    router.push(`/app/${churchId}/answer/${categoryId}/complete`)
  }
  return (
    <AnswerForm
      categoryName={categoryName}
      items={items}
      initialValues={initialValues}
      initialReflections={initialReflections}
      onSaveAnswer={onSaveAnswer}
      onComplete={onComplete}
    />
  )
}
