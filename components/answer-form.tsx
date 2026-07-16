'use client'

import { useState } from 'react'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
}

export function AnswerForm({
  categoryName,
  items,
  requireName,
  onSubmit,
}: {
  categoryName: string
  items: AnswerFormItem[]
  requireName: boolean
  onSubmit: (answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(items.map((i) => [i.id, 5])),
  )
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return <p className="font-body text-ink">Thank you — your answers have been recorded.</p>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (requireName && name.trim() === '') {
      setError('Please enter your name.')
      return
    }
    setPending(true)
    const answers: AnswerInput[] = items.map((i) => ({ item_id: i.id, value: values[i.id] ?? 5 }))
    const result = await onSubmit(answers, requireName ? name.trim() : null)
    setPending(false)
    if (result.ok) setDone(true)
    else setError(result.error ?? 'Something went wrong. Please try again.')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

      {requireName && (
        <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          Your name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink"
          />
        </label>
      )}

      {items.map((item) => (
        <fieldset key={item.id} className="flex flex-col gap-2">
          <legend className="font-body text-sm text-ink">{item.text}</legend>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={values[item.id]}
              onChange={(e) => setValues((v) => ({ ...v, [item.id]: Number(e.target.value) }))}
              className="w-full"
              aria-label={item.text}
            />
            <span className="w-6 text-right font-body text-sm text-ink">{values[item.id]}</span>
          </div>
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit'}
      </button>

      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </form>
  )
}
