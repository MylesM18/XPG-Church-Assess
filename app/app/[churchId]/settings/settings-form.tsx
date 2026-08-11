'use client'

import { useActionState } from 'react'
import { updateChurchSettings, type SettingsState } from './actions'
import { LiveStatus } from '@/components/live-status'
import type { ChurchProfile } from '@/lib/data/churches'

const initial: SettingsState = { error: null, saved: false }

const CONTEXTS = ['urban', 'suburban', 'small_town', 'rural'] as const

// Valid cohort bands (keys mirror methodology/benchmarks.yaml) — required, the engine
// keys its cohort percentiles by this band.
const ATTENDANCE_BANDS = [
  ['under_100', 'Under 100'],
  ['100_249', '100–249'],
  ['250_499', '250–499'],
  ['500_999', '500–999'],
  ['1000_1499', '1,000–1,499'],
  ['1500_plus', '1,500+'],
] as const

const GROWTH_OPTIONS = [
  ['declining', 'Declining'],
  ['plateaued', 'Plateaued'],
  ['growing_steadily', 'Growing steadily'],
  ['growing_rapidly', 'Growing rapidly'],
] as const

// Mirrors the migration CHECK (20260810000100): owned | rented | portable | mixed.
const FACILITY_OPTIONS = [
  ['owned', 'Owned'],
  ['rented', 'Rented'],
  ['portable', 'Portable'],
  ['mixed', 'Mixed'],
] as const

const BAND_TEXT_FIELDS = [
  ['denomination', 'Denomination'],
  ['adults_band', 'Adults'],
  ['staff_fte_band', 'Staff (FTE)'],
  ['budget_band', 'Annual budget'],
  ['church_age_band', 'Church age'],
  ['campuses_band', 'Campuses'],
] as const

const TEXTAREA_FIELDS = [
  ['leadership_history', 'Leadership history', 'Tenure changes, transitions, or anything about the leadership story that context helps a reader understand. Please don’t name individuals — the report is anonymous, and anything naming a participant is left out of it.'],
  ['consultant_notes', 'Consultant notes', 'Anything else the report should know — e.g. current initiatives, recent changes, or context the questions don’t capture. Please don’t name individuals — the report is anonymous, and anything naming a participant is left out of it.'],
] as const

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function SettingsForm({ church }: { church: ChurchProfile }) {
  const [state, formAction, pending] = useActionState(updateChurchSettings, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="church_id" value={church.id} />

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Context
        <select name="context" defaultValue={church.context ?? ''} className={inputClass}>
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
        <select
          name="attendance_band"
          defaultValue={church.attendance_band ?? ''}
          required
          className={inputClass}
        >
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

      {BAND_TEXT_FIELDS.map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <input
            name={name}
            type="text"
            defaultValue={church[name] ?? ''}
            className={inputClass}
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Growth trajectory
        <select
          name="growth_trajectory"
          defaultValue={church.growth_trajectory ?? ''}
          className={inputClass}
        >
          <option value="">Select…</option>
          {GROWTH_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Facility
        <select
          name="facility_status"
          defaultValue={church.facility_status ?? ''}
          className={inputClass}
        >
          <option value="">Select…</option>
          {FACILITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {TEXTAREA_FIELDS.map(([name, label, hint]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <span className="text-xs text-ink-soft">{hint}</span>
          <textarea
            name={name}
            rows={4}
            defaultValue={church[name] ?? ''}
            className={inputClass}
          />
        </label>
      ))}

      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>

      <LiveStatus message={state.error} tone="error" className="font-body text-sm text-berry" />
      {/* Always mounted (not conditionally rendered) — same reasoning as LiveStatus's own
          sr-only collapse: a live region inserted at the same moment as its first message is
          silently missed by screen readers (see tests/a11y/live-regions-applied.test.ts). */}
      <p
        role="status"
        className={state.saved && !state.error ? 'font-body text-sm text-ink-soft' : 'sr-only'}
      >
        {state.saved && !state.error ? 'Settings saved.' : ''}
      </p>
    </form>
  )
}
