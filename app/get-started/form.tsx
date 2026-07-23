'use client'

import { useActionState } from 'react'
import { createChurch, type CreateChurchState } from './actions'
import { FieldInfo } from './field-info'
import { LiveStatus } from '@/components/live-status'

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

// Growth trajectory persists as text (nullable column). Slug values are future-proof if the
// value is ever constrained; the empty placeholder becomes null via emptyToNull in actions.ts.
const GROWTH_OPTIONS = [
  ['declining', 'Declining'],
  ['plateaued', 'Plateaued'],
  ['growing_steadily', 'Growing steadily'],
  ['growing_rapidly', 'Growing rapidly'],
] as const

// Text band fields; the third tuple element (help) opts a field into a FieldInfo icon.
const BAND_TEXT_FIELDS: readonly (readonly [string, string, string?])[] = [
  ['adults_band', 'Adults'],
  ['staff_fte_band', 'Staff (FTE)', 'FTE = full-time equivalent. One full-time role = 1.0, a half-time role = 0.5. Add them up — e.g. 2 full-time + 1 half-time staff = 2.5.'],
  ['budget_band', 'Annual budget'],
  ['church_age_band', 'Church age'],
] as const

const CONTEXT_HELP =
  'Whether your church is in an urban, suburban, small-town, or rural setting. We use this to compare you against similar churches.'

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

      <div className="flex flex-col gap-1">
        <FieldInfo htmlFor="context" label="Context">
          {CONTEXT_HELP}
        </FieldInfo>
        <select id="context" name="context" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

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

      {BAND_TEXT_FIELDS.map(([name, label, help]) => (
        <div key={name} className="flex flex-col gap-1">
          {help ? (
            <FieldInfo htmlFor={name} label={label}>
              {help}
            </FieldInfo>
          ) : (
            <label htmlFor={name} className="font-body text-sm text-ink-soft">
              {label}
            </label>
          )}
          <input id={name} name={name} type="text" className={inputClass} />
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <FieldInfo htmlFor="growth_trajectory" label="Growth trajectory">
          <p>
            Think about your average weekend attendance over the last two to three years — actual
            people, not giving or membership. Pick the option that best matches the overall
            direction, setting aside seasonal dips.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            <li><span className="text-ink">Declining</span> — attendance has trended down.</li>
            <li><span className="text-ink">Plateaued</span> — attendance has held roughly flat.</li>
            <li><span className="text-ink">Growing steadily</span> — attendance has grown gradually.</li>
            <li><span className="text-ink">Growing rapidly</span> — attendance has grown quickly.</li>
          </ul>
        </FieldInfo>
        <select id="growth_trajectory" name="growth_trajectory" defaultValue="" className={inputClass}>
          <option value="">Select…</option>
          {GROWTH_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Creating…' : 'Create church'}
      </button>

      <LiveStatus message={state.error} tone="error" className="font-body text-sm text-berry" />
    </form>
  )
}
