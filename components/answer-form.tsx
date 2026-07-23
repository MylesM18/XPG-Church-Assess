'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { band, BANDS } from '@/lib/answers/band'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
  anchors: { lo: string; mid: string; hi: string }
}

const RANGE_LABEL: Record<'lo' | 'mid' | 'hi', string> = { lo: '1–3', mid: '4–7', hi: '8–10' }

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
  const [values, setValues] = useState<Record<string, number | null>>(
    () => Object.fromEntries(items.map((i) => [i.id, null])),
  )
  const [name, setName] = useState('')
  const [step, setStep] = useState(0) // 0-based over the full step list (name step included when requireName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const hasNameStep = requireName
  const questionCount = items.length
  const totalSteps = questionCount + (hasNameStep ? 1 : 0)
  const isNameStep = hasNameStep && step === 0
  const questionIndex = hasNameStep ? step - 1 : step
  const currentItem = isNameStep ? null : items[questionIndex]
  const isLastStep = step === totalSteps - 1
  const questionNumber = hasNameStep ? Math.max(1, step) : step + 1

  const currentAnswered = isNameStep
    ? name.trim() !== ''
    : currentItem != null && values[currentItem.id] != null

  // Move focus to the step heading on every step change (mirrors the done→h1 focus discipline
  // already in this component). A plain :focus outline on the heading guarantees a visible ring
  // after PROGRAMMATIC focus (focus-visible may not fire).
  useEffect(() => {
    if (!done) headingRef.current?.focus()
  }, [step, done])

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

  function goBack() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  function goNext() {
    setError(null)
    if (!currentAnswered) return
    setStep((s) => Math.min(totalSteps - 1, s + 1))
  }

  async function handleSubmit() {
    setError(null)
    const answers: AnswerInput[] = []
    for (const i of items) {
      const v = values[i.id]
      if (v == null) {
        setError('Please answer every question before submitting.')
        return
      }
      answers.push({ item_id: i.id, value: v })
    }
    if (requireName && name.trim() === '') {
      setError('Please enter your name.')
      return
    }
    setPending(true)
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
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (isLastStep) handleSubmit()
        else goNext()
      }}
      className="flex flex-col gap-6"
    >
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

      {!isNameStep && (
        <div className="flex flex-col gap-1">
          <p className="font-body text-sm text-ink-soft">
            Question {questionNumber} of {questionCount}
          </p>
          <div
            role="progressbar"
            aria-label="Assessment progress"
            aria-valuemin={1}
            aria-valuemax={questionCount}
            aria-valuenow={questionNumber}
            className="h-1.5 w-full overflow-hidden rounded-full bg-sand"
          >
            <div
              className="h-full bg-ink transition-[width]"
              style={{ width: `${(questionNumber / questionCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isNameStep ? (
        <div className="flex flex-col gap-2">
          <h2
            tabIndex={-1}
            ref={headingRef}
            className="font-display text-lg text-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          >
            Before you begin — what’s your name?
          </h2>
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Your name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </label>
        </div>
      ) : currentItem ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Question {questionNumber} of {questionCount}</legend>
          <h2
            tabIndex={-1}
            ref={headingRef}
            className="font-display text-lg text-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          >
            {currentItem.text}
          </h2>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={values[currentItem.id] ?? 5}
              onChange={(e) => setValues((v) => ({ ...v, [currentItem.id]: Number(e.target.value) }))}
              className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              aria-label={currentItem.text}
              aria-describedby={`bands-${currentItem.id}`}
            />
            <span className="w-8 text-right font-body text-sm text-ink" aria-hidden="true">
              {values[currentItem.id] ?? '—'}
            </span>
          </div>
          {values[currentItem.id] == null && (
            <p className="font-body text-xs text-ink-soft">Drag to choose 1–10.</p>
          )}

          <ul id={`bands-${currentItem.id}`} className="flex flex-col gap-2">
            {BANDS.map((b) => {
              const v = values[currentItem.id]
              const active = v != null && band(v) === b.key
              return (
                <li
                  key={b.key}
                  className={
                    'rounded-md border-l-4 p-3 font-body text-sm ' +
                    (active ? 'border-ink bg-sand text-ink' : 'border-line bg-paper text-ink-soft')
                  }
                >
                  <span className="text-ink">
                    {b.label} <span className="text-xs">({RANGE_LABEL[b.key]})</span>
                  </span>
                  {active && <span className="sr-only"> — where you land</span>}
                  <span className="mt-1 block">{currentItem.anchors[b.key]}</span>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-disabled={step === 0}
          className="rounded-md border border-line px-4 py-2 font-body text-ink transition-opacity hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back
        </button>

        <button
          type="submit"
          aria-disabled={(isLastStep && pending) || !currentAnswered}
          onClick={(e) => { if (((isLastStep && pending) || !currentAnswered)) e.preventDefault() }}
          className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {isLastStep ? (pending ? 'Submitting…' : 'Submit') : 'Next'}
        </button>
      </div>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
    </form>
  )
}
