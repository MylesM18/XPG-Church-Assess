// app/r/[shareToken]/page.tsx
// Public, tokenized, read-only report. No auth. Rendered with audience 'shared', which is
// the SECOND of two independent respondent-name strips — get_shared_report already removed
// them in SQL (strip_respondents empties disagreement_flags[].respondents — and, for rows
// persisted before Task 13's engine rename, the legacy dispersion_flags[].respondents too
// (20260728000200) — plus evidence_trail[].refs). Both must fail before a name can leak.
//
// Those two strips cover `payload` and nothing else, so this page renders deterministic
// fallbackProse unconditionally rather than reading AI prose. That is not belt-and-braces:
// AI prose is generated from a prompt embedding the whole Diagnosis, so it can carry
// respondent names past BOTH strips. get_shared_report no longer returns a `prose` column at
// all (20260718000600), which is what makes "two independent strips" a true statement of this
// path's posture — prose is structurally absent here, not merely unused.
//
// This is a Server Component and stays one: it passes only the built ReportView and the
// already-stripped Diagnosis to children. Handing the raw RPC row to a Client Component
// would ship respondent names to the browser inside RSC flight data.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { buildReportView } from '@/lib/report/view'
import type { Diagnosis } from '@/lib/engine/types'
import { CoverCard, VerdictHeader, AreaTable } from '@/app/app/[churchId]/diagnosis/report/cover'
import { ChainWalk, EvidenceReceipt, CostSection } from '@/app/app/[churchId]/diagnosis/report/chain'
import { DependencyMap, Calibration, Disagreement, GatingFlags } from '@/app/app/[churchId]/diagnosis/report/system'
import { AreaDossier } from '@/app/app/[churchId]/diagnosis/report/dossier'
import { NextStep, Appendix } from '@/app/app/[churchId]/diagnosis/report/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ shareToken: string }>
}) {
  const { shareToken } = await params

  // Malformed token: fail before touching the database, as the PDF route does.
  if (!UUID.test(shareToken)) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_shared_report', { p_token: shareToken })

  if (error) {
    // Reason only — never the payload, the blocks, or respondent data.
    console.warn('[m6a] shared report RPC failed:', error.message)
    notFound()
  }

  const row = Array.isArray(data) ? data[0] : null

  // Revoked, expired and unknown all arrive here identically, and all 404. Never a 403 —
  // that would let a caller probe which tokens exist.
  if (!row || !row.valid) notFound()

  const diagnosis = row.payload as Diagnosis
  const methodology = loadMethodology()
  const brand = resolveBrand(row.church_name)

  // Deliberately NOT gated on PROSE_MODE — see the header comment. The RPC returns no prose
  // column, so there is nothing here for one env var to silently switch on.
  const blocks: ReportBlocks = fallbackProse(diagnosis, methodology)

  const view = buildReportView(diagnosis, blocks, methodology, { audience: 'shared' })

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md font-display text-base text-white"
          style={{ backgroundColor: row.brand_color }}
        >
          {brand.monogram}
        </div>
        {/* Not an <h1>: CoverCard below renders the page's one true <h1> ("Overall church
            health") — tests/a11y/shared-report-heading.test.ts pins exactly one <h1> on this
            public, unauthenticated page. Same visual treatment as before, just a <p>. */}
        <p className="font-display text-lg text-ink">{row.church_name}</p>
      </div>

      {/* Layer 1 — the verdict. Same order as ReportBody (app/app/[churchId]/diagnosis/report/
          shared.tsx), minus the PDF/Share admin buttons — those belong to the authenticated
          diagnosis page, not a public forwarded link. */}
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

      {/* Layer 3 — the eight areas, fixed chain-then-enabler order (view.areas' own order —
          never re-sorted here). Rendered inline on every surface, PDF included (spec §7.8). */}
      {view.areas.map((area) => (
        <AreaDossier key={area.category_id} area={area} />
      ))}

      {/* Layer 4 — what to do. audience 'shared' always leaves view.nextStep undefined
          (lib/report/view.ts) — the CTA is an admin action a board member reading a
          forwarded link cannot take. Gated here anyway, deliberately, rather than relying on
          that invariant holding forever: this page does not inherit the guard from
          app/app/[churchId]/diagnosis/page.tsx, and nextStep being optional on ReportView means
          tsc itself refuses an ungated `.callType` access. */}
      {view.nextStep && (
        <NextStep
          callType={view.nextStep.callType}
          hook={view.nextStep.hook}
          nextStep={view.nextStep.text}
        />
      )}

      <Appendix
        categories={view.appendix.categories}
        stages={view.stages}
        benchmarkNote={view.appendix.benchmarkNote}
      />

      <p className="font-body text-sm text-ink-soft">
        Shared read-only view. This link expires and can be revoked at any time.
      </p>
    </main>
  )
}
