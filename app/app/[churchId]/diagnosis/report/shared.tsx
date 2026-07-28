// app/app/[churchId]/diagnosis/report/shared.tsx
import Link from 'next/link'
import type { Diagnosis, DiagnosisCategory } from '@/lib/engine/types'
import type { Methodology } from '@/lib/methodology/schema'

// Confidence band — UI-only presentation mapping, explicitly separate from methodology YAML (spec §7).
export function confidenceBand(c: number): { label: string; low: boolean } {
  if (c >= 0.75) return { label: 'High', low: false }
  if (c >= 0.5) return { label: 'Moderate', low: false }
  return { label: 'Low', low: true }
}

export function EmptyState({ churchId }: { churchId: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-display text-2xl text-ink">No diagnosis yet</h1>
      <p className="font-body text-ink-soft">This assessment hasn’t been diagnosed yet.</p>
      <Link
        href={`/app/${churchId}`}
        className="py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Back to the dashboard
      </Link>
    </main>
  )
}

export function NextStep({
  callType, hook, nextStep,
}: {
  callType: string
  hook: string
  nextStep: string
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-xl text-ink">Recommended next step</h2>
      <p className="font-body text-ink">{nextStep}</p>
      <p className="font-body text-base text-ink">{callType} — {hook}</p>
    </section>
  )
}

export function Appendix({
  diagnosis, methodology, benchmarkNote,
}: {
  diagnosis: Diagnosis
  methodology: Methodology
  benchmarkNote: string
}) {
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]))
  const chain = methodology.rules.chain
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Appendix — all scores</h2>
      <ul className="flex flex-col gap-1">
        {diagnosis.categories.map((c: DiagnosisCategory) => {
          const idx = chain.indexOf(c.category_id)
          const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler'
          return (
            <li key={c.category_id} className="font-body text-sm text-ink-soft">
              {names.get(c.category_id) ?? c.category_id} ({tag}): {c.score}
              {c.cohort_percentile !== null ? ` · ${c.cohort_percentile}th pct` : ''}
            </li>
          )
        })}
      </ul>
      <p className="font-body text-xs text-ink-soft">{benchmarkNote}</p>
    </section>
  )
}
