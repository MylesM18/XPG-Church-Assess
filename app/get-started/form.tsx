'use client'

import { useActionState } from 'react'
import { createChurch, type CreateChurchState } from './actions'

const initial: CreateChurchState = { error: null }

const CONTEXTS = ['urban', 'suburban', 'small_town', 'rural'] as const

// Valid cohort bands (keys mirror methodology/benchmarks.yaml). Required: the diagnosis
// engine keys its cohort percentiles by this band, so a church must have one to generate.
const ATTENDANCE_BANDS = [
  ['under_100', 'Under 100'],
  ['100_249', '100–249'],
  ['250_499', '250–499'],
  ['500_999', '500–999'],
  ['1000_1499', '1,000–1,499'],
  ['1500_plus', '1,500+'],
] as const

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function GetStartedForm() {
  const [state, formAction, pending] = useActionState(createChurch, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Church name (required)
        <input name="name" type="text" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Denomination
        <input name="denomination" type="text" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Context
        <select name="context" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Weekend attendance (required)
        <select name="attendance_band" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            —
          </option>
          {ATTENDANCE_BANDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {(
        [
          ['adults_band', 'Adults'],
          ['staff_fte_band', 'Staff (FTE)'],
          ['budget_band', 'Annual budget'],
          ['church_age_band', 'Church age'],
          ['growth_trajectory', 'Growth trajectory'],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <input name={name} type="text" className={inputClass} />
        </label>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Creating…' : 'Create church'}
      </button>

      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}
    </form>
  )
}
