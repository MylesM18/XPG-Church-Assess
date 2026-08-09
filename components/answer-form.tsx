'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { band, BANDS } from '@/lib/answers/band'
import { firstUnansweredStep } from '@/lib/answers/resume'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
  anchors: { lo: string; mid: string; hi: string }
  reflection?: string
}

const RANGE_LABEL: Record<'lo' | 'mid' | 'hi', string> = { lo: '1–3', mid: '4–7', hi: '8–10' }

export function AnswerForm({
  categoryName,
  items,
  initialValues,
  initialReflections = {},
  onSaveAnswer,
  onComplete,
}: {
  categoryName: string
  items: AnswerFormItem[]
  initialValues: Record<string, number>
  initialReflections?: Record<string, string>
  onSaveAnswer: (answer: AnswerInput) => Promise<{ ok: boolean; error?: string }>
  onComplete: () => void
}) {
  const [values, setValues] = useState<Record<string, number | null>>(
    () => Object.fromEntries(items.map((i) => [i.id, initialValues[i.id] ?? null])),
  )
  const [reflections, setReflections] = useState<Record<string, string>>(initialReflections)
  // Open at the first unanswered question; if all are answered (Take Again), open at step 0.
  const [step, setStep] = useState(() => firstUnansweredStep(items.map((i) => i.id), initialValues))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)

  const questionCount = items.length
  const currentItem = items[step]
  const isLastStep = step === questionCount - 1
  const questionNumber = step + 1
  const currentAnswered = currentItem != null && values[currentItem.id] != null

  // Move focus to the question heading on every step change (mirrors the original focus discipline).
  // A plain :focus outline guarantees a visible ring after PROGRAMMATIC focus (focus-visible may not fire).
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // Save the current question's answer (upsert). Returns false + shows an error on failure.
  async function saveCurrent(): Promise<boolean> {
    if (currentItem == null) return false
    const v = values[currentItem.id]
    if (v == null) {
      setError('Please choose a value before continuing.')
      return false
    }
    setError(null)
    setPending(true)
    try {
      const result = await onSaveAnswer(
        currentItem.reflection
          ? { item_id: currentItem.id, value: v, reflection: (reflections[currentItem.id] ?? '').trim() }
          : { item_id: currentItem.id, value: v },
      )
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong. Please try again.')
        return false
      }
      return true
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setPending(false)
    }
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  async function goNext() {
    if (pending) return
    if (await saveCurrent()) setStep((s) => Math.min(questionCount - 1, s + 1))
  }

  async function finish() {
    if (pending) return
    if (await saveCurrent()) onComplete()
  }

  if (currentItem == null) return null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (isLastStep) finish()
        else goNext()
      }}
      className="flex flex-col gap-6"
    >
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

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

        {currentItem.reflection && (
          <div className="mt-6">
            <label htmlFor={`reflection-${currentItem.id}`} className="font-body text-sm text-ink">
              {currentItem.reflection}{' '}
              <span className="font-body text-xs text-ink-soft">(Optional)</span>
            </label>
            <textarea
              id={`reflection-${currentItem.id}`}
              value={reflections[currentItem.id] ?? ''}
              onChange={(e) => setReflections((prev) => ({ ...prev, [currentItem.id]: e.target.value }))}
              rows={4}
              aria-describedby={`reflection-hint-${currentItem.id} reflection-counter-${currentItem.id}`}
              className="mt-2 w-full rounded-md border border-line bg-paper p-3 font-body text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
            <p id={`reflection-hint-${currentItem.id}`} className="font-body text-xs text-ink-soft">
              Optional — shown unattributed in your church&rsquo;s report.
            </p>
            <div id={`reflection-counter-${currentItem.id}`}>
              <LiveStatus
                message={
                  (reflections[currentItem.id] ?? '').length >= 1800
                    ? `${Math.max(0, 2000 - (reflections[currentItem.id] ?? '').length)} characters left`
                    : null
                }
                tone="status"
                className="font-body text-xs text-ink-soft"
              />
            </div>
          </div>
        )}
      </fieldset>

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
          aria-disabled={pending || !currentAnswered}
          onClick={(e) => { if (pending || !currentAnswered) e.preventDefault() }}
          className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {isLastStep ? (pending ? 'Finishing…' : 'Finish') : (pending ? 'Saving…' : 'Next')}
        </button>
      </div>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
    </form>
  )
}
