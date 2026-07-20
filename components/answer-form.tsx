'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
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
  const doneRef = useRef<HTMLHeadingElement>(null)

  // Declared ABOVE the `if (done)` early return on purpose — hooks after it would not run on the
  // success render and would break the rules of hooks.
  //
  // The submit button unmounts with the form, so without this focus falls to <body>. Moving focus
  // to the confirmation both announces it and leaves the keyboard somewhere sensible. It is an
  // <h1> because the form's own <h1>{categoryName}</h1> unmounts with it, and neither of this
  // component's two call sites — app/respond/[token]/page.tsx and
  // app/app/[churchId]/answer/[categoryId]/self-form.tsx — nor any layout above them supplies a
  // heading, so the success page would otherwise have no <h1> at all.
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  if (done) {
    return (
      <h1 tabIndex={-1} ref={doneRef} className="font-display text-2xl text-ink">
        Thank you — your answers have been recorded.
      </h1>
    )
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
    try {
      const result = await onSubmit(answers, requireName ? name.trim() : null)
      if (result.ok) setDone(true)
      else setError(result.error ?? 'Something went wrong. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
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
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
              className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              aria-label={item.text}
            />
            <span className="w-6 text-right font-body text-sm text-ink">{values[item.id]}</span>
          </div>
        </fieldset>
      ))}

      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Submitting…' : 'Submit'}
      </button>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </form>
  )
}
