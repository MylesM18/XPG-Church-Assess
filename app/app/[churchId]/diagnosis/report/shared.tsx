// app/app/[churchId]/diagnosis/report/shared.tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DiagnosisCategory } from '@/lib/engine/types'
import type { StageView } from '@/lib/report/chain-walk'
import type { ReportView } from '@/lib/report/view'
import { GenerateButton } from '@/app/app/[churchId]/generate-button'
import { CoverCard, VerdictHeader, AreaTable } from './cover'
import { ChainWalk, EvidenceReceipt, CostSection } from './chain'
import { DependencyMap, Calibration, Disagreement, GatingFlags } from './system'
import { AreaDossier } from './dossier'

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

/**
 * Thinner now that the dossiers carry the detail (spec §7 Layer 4) — sourced
 * entirely from ReportView (`view.appendix.categories`, already carrying
 * resolved names, and `view.stages` for chain membership/order), not from the
 * raw Diagnosis/Methodology: the view is the one place PDF and screen and
 * shared cannot drift apart on section content (lib/report/view.ts).
 */
export function Appendix({
  categories, stages, benchmarkNote,
}: {
  categories: Array<DiagnosisCategory & { name: string }>
  stages: StageView[]
  benchmarkNote: string
}) {
  const chainIds = stages.map((s) => s.category_id)
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Appendix — all scores</h2>
      <ul className="flex flex-col gap-1">
        {categories.map((c) => {
          const idx = chainIds.indexOf(c.category_id)
          const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler'
          return (
            <li key={c.category_id} className="font-body text-sm text-ink-soft">
              {c.name} ({tag}): {c.score}
              {c.cohort_percentile !== null ? ` · ${c.cohort_percentile}th pct` : ''}
            </li>
          )
        })}
      </ul>
      <p className="font-body text-xs text-ink-soft">{benchmarkNote}</p>
    </section>
  )
}

/**
 * The message is taken as `children`, not hardcoded inside this component: the
 * component is otherwise indistinguishable from any other card, but rendering
 * its message via `children` is what lets ReportBody's own construction of this
 * element carry the copy — which is what makes the stale branch assertable by
 * tests/report/components.test.ts's textOf() helper (it only ever descends
 * through an element's `children` prop, and never invokes a nested component's
 * body, so a hardcoded internal string would be invisible to it). Wired to the
 * existing regenerate action (GenerateButton / generateDiagnosis) rather than a
 * new one — this is the same one-shot action the dashboard already uses.
 */
export function StaleMethodologyNotice({
  churchId, children,
}: {
  churchId: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-lg border border-line bg-paper p-6">
      <h1 className="font-display text-xl text-ink">{children}</h1>
      <GenerateButton churchId={churchId} />
    </section>
  )
}

/**
 * The stale-vs-fresh decision (spec §5.4), kept as a pure presentational
 * component precisely so it is testable without a renderer (Task 15 brief
 * Step 6). `diagnoses.payload` is cached JSONB: every row from before this
 * reform is methodology_version '0.1.0' and carries `overall_score`, never
 * `throughput` — rendering one through the new components would produce a
 * blank cover and eight empty dossiers rather than a working report. The async
 * page does the data fetch and delegates to this component; it holds no
 * branching logic of its own.
 */
export function ReportBody({
  storedVersion, currentVersion, view, churchId,
}: {
  storedVersion: string
  currentVersion: string
  view: ReportView
  churchId: string
}) {
  if (storedVersion !== currentVersion) {
    return (
      <StaleMethodologyNotice churchId={churchId}>
        This report predates the current methodology — regenerate to see the new analysis
      </StaleMethodologyNotice>
    )
  }

  return (
    <>
      {/* Layer 1 — the verdict */}
      <CoverCard cover={view.cover} />
      <VerdictHeader verdict={view.verdict} confidence={view.confidence} />
      <AreaTable areas={view.areas} />

      {/* Layer 2 — how your system behaves */}
      <ChainWalk stages={view.stages} />
      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      <DependencyMap system={view.system} />
      <Calibration spread={view.system.calibrationSpread} text={view.system.calibrationText} />
      {view.system.disagreement && (
        <Disagreement text={view.system.disagreement.text} respondents={view.system.disagreement.respondents} />
      )}
      {view.system.gating && <GatingFlags text={view.system.gating} />}

      {/* Layer 3 — the eight areas, fixed chain-then-enabler order */}
      {view.areas.map((area) => (
        <AreaDossier key={area.category_id} area={area} />
      ))}

      {/* Layer 4 — what to do. No generated 30/60/90 roadmap (spec §7.6). */}
      {view.nextStep && (
        <NextStep callType={view.nextStep.callType} hook={view.nextStep.hook} nextStep={view.nextStep.text} />
      )}
      <Appendix categories={view.appendix.categories} stages={view.stages} benchmarkNote={view.appendix.benchmarkNote} />
    </>
  )
}
