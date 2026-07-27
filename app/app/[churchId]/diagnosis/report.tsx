// app/app/[churchId]/diagnosis/report.tsx
import Link from 'next/link'
import type { Diagnosis, DiagnosisCategory, EvidenceRef } from '@/lib/engine/types'
import type { Methodology } from '@/lib/methodology/schema'
import type { StageView } from '@/lib/report/chain-walk'
import { GENEROSITY_COPY } from '@/lib/report/copy'

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

export function VerdictHeader({
  name, brandColor, monogram, verdict, throughput, confidence,
}: {
  name: string
  brandColor: string
  monogram: string
  verdict: string
  throughput: number
  confidence: number
}) {
  const band = confidenceBand(confidence)
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md font-display text-lg text-white"
          style={{ backgroundColor: brandColor }}
        >
          {monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{name}</h1>
          <p className="font-body text-sm text-ink-soft">Overall {throughput} · Confidence: {band.label}</p>
        </div>
      </div>
      <p className="font-body text-lg text-ink">{verdict}</p>
      {band.low && (
        <p className="font-body text-sm text-ink-soft">
          Based on limited responses — add respondents to sharpen this.
        </p>
      )}
    </header>
  )
}

export function StageTile({ stage }: { stage: StageView }) {
  const isConstraint = stage.bucket === 'constraint'
  const isDownstream = stage.bucket === 'downstream'
  const label = isConstraint ? 'Constraint' : isDownstream ? 'Downstream' : 'Holding'
  const barColor = isDownstream
    ? 'var(--color-ink-soft)'
    : isConstraint
      ? 'var(--color-berry)'
      : 'var(--color-sage)'
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-md border p-3',
        isConstraint ? 'border-l-4 border-berry' : 'border-line',
        isDownstream ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className={['font-display text-base', isConstraint ? 'text-berry' : 'text-ink'].join(' ')}>
          {stage.name}
        </span>
        <span className={['font-body text-sm', isDownstream ? 'text-ink-soft' : 'text-ink'].join(' ')}>
          {label} · {stage.score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-sand">
        <div className="h-1.5 rounded-full" style={{ width: `${stage.score}%`, backgroundColor: barColor }} />
      </div>
      {isConstraint && <p className="font-body text-sm text-berry">Your constraint — work here first.</p>}
      {isDownstream && stage.isDoNotWorkOn && (
        <span className="font-body text-xs text-ink-soft">Symptom of the constraint</span>
      )}
    </div>
  )
}

export function ChainWalk({ stages }: { stages: StageView[] }) {
  const anyDownstream = stages.some((s) => s.bucket === 'downstream')
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-ink">The chain walk</h2>
      <div className="flex flex-col gap-2">
        {stages.map((s) => (
          <StageTile key={s.category_id} stage={s} />
        ))}
      </div>
      {anyDownstream && (
        <p className="font-body text-sm text-ink-soft">Don’t work on the faded stages yet.</p>
      )}
    </section>
  )
}

export function EvidenceReceipt({ text, refs }: { text: string; refs: EvidenceRef[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">The evidence</h2>
      <p className="font-body text-ink">{text}</p>
      {refs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {refs.map((r) => (
            <li key={r.ref} className="font-body text-sm text-ink-soft">
              {r.ref}: {r.value ?? 'n/a'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function BlindSpots({ text }: { text: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Blind spots</h2>
      <p className="font-body text-ink">{text}</p>
    </section>
  )
}

export function CostSection({ cost, doNotWorkOn }: { cost: string; doNotWorkOn?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">What it’s costing you</h2>
      <p className="font-body text-ink">{cost}</p>
      {doNotWorkOn && <p className="font-body text-sm text-ink-soft">{doNotWorkOn}</p>}
    </section>
  )
}

export function GatingFlags({ text }: { text: string }) {
  // Flags never headline — a muted secondary note (spec §6.2 row 6).
  return (
    <section className="flex flex-col gap-1">
      <p className="font-body text-sm text-ink-soft">{text}</p>
    </section>
  )
}

export function GenerositySplit({ mode }: { mode: 'breadth' | 'depth' | 'both' }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Generosity</h2>
      <p className="font-body text-ink">{GENEROSITY_COPY[mode]}</p>
    </section>
  )
}

export function Disagreement({
  text, respondents,
}: {
  text: string
  respondents: Array<{ label: string; mean: number }>
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Where your leaders disagree</h2>
      <p className="font-body text-ink">{text}</p>
      {respondents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respondents.map((r) => (
            <li key={r.label} className="font-body text-sm text-ink-soft">
              {r.label}: {r.mean.toFixed(1)}
            </li>
          ))}
        </ul>
      )}
    </section>
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
