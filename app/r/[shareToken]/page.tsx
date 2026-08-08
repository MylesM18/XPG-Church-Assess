// app/r/[shareToken]/page.tsx
// Public, tokenized, read-only report. No auth. Rendered with audience 'shared'.
//
// CT-2(c): this page RE-DERIVES the Diagnosis from the run's responses under the current
// methodology (deriveDiagnosisForRun) rather than reading the cached, possibly-stale
// diagnoses.payload. The responses arrive via get_shared_run_responses — a token-gated sibling
// of get_shared_report — which under owner ruling "Option B" REDACTS respondent_label to the
// empty string and returns the REAL (opaque) respondent_user_id. normalize() keys on
// respondent_user_id ?? respondent_label, so scores are bit-identical to the admin path while no
// human-readable name ever leaves Postgres; the 'shared' audience then strips the respondents
// list at the view layer too. Two independent name defenses, same as before — just relocated
// from the payload strip to the response-read redaction.
//
// This is a Server Component and stays one: it passes only the built ReportView to children.
// Handing raw RPC rows to a Client Component would ship data to the browser inside RSC flight.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse } from '@/lib/ai/fallback'
import { resolveReportView } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import type { Response } from '@/lib/engine/types'
import { CoverCard, VerdictHeader, AreaTable } from '@/app/app/[churchId]/diagnosis/report/cover'
import { ChainWalk, EvidenceReceipt, CostSection } from '@/app/app/[churchId]/diagnosis/report/chain'
import { DependencyMap, Calibration, Disagreement, GatingFlags } from '@/app/app/[churchId]/diagnosis/report/system'
import { AreaDossier } from '@/app/app/[churchId]/diagnosis/report/dossier'
import { NextStep, BookingCta, Appendix, SharedStaleMethodologyNotice } from '@/app/app/[churchId]/diagnosis/report/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Raw shape of one get_shared_run_responses row. respondent_label is redacted to '' by the RPC;
// respondent_user_id is the real (opaque) identity; attendance_band and methodology_version are
// denormalized onto every row because the anon page cannot query churches or assessment_runs.
//
// There is DELIBERATELY no `reflection` field here. Free-text reflections are excluded from the
// public share surface at three independent layers, and this row type is one of them: the RPC
// never selects the column, this shape does not name it, and nothing on this page passes
// reflections down. Adding it here would quietly undo one of the three.
interface SharedRunResponseRow {
  category_id: string
  item_id: string
  value: number
  respondent_label: string
  respondent_user_id: string | null
  attendance_band: string | null
  methodology_version: string | null
}

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

  const methodology = loadMethodology()
  const brand = resolveBrand(row.church_name)

  // CT-2(c): re-derive from the run's responses (token-gated, name-redacted) instead of reading
  // row.payload. The band is denormalized onto each response row because this anon path cannot
  // query churches. respondent_id keys on the real user id first, so scores match the admin path.
  const { data: rawResponses } = await supabase.rpc('get_shared_run_responses', { p_token: shareToken })
  const responseRows = (Array.isArray(rawResponses) ? rawResponses : []) as SharedRunResponseRow[]
  const responses: Response[] = responseRows.map((r) => ({
    category_id: r.category_id,
    item_id: r.item_id,
    value: r.value,
    respondent_label: r.respondent_label,
    respondent_id: r.respondent_user_id ?? r.respondent_label,
  }))
  const derived = deriveDiagnosisForRun(
    responses,
    methodology,
    { attendance_band: responseRows[0]?.attendance_band ?? '' },
    responseRows[0]?.methodology_version ?? null,
  )

  // The edition the scoring actually used: a forwarded link to a legacy run must render the
  // question set that run was actually scored against, never the current one. Reverting this to
  // `methodology` compiles and leaves every test green — see lib/report/derive.ts's DeriveResult
  // doc for why it is wrong anyway. Never read on the not-ok arm — that path returns the notice
  // below without building a view.
  const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology

  // Deliberately NOT gated on PROSE_MODE — this public path never reads AI prose (which could
  // carry names past both defenses); it renders deterministic, provably name-free fallbackProse.
  // The thunk stays lazy (only evaluated on the scoreable path) purely to preserve the shared
  // call shape tests/report/route-call-ordering.test.ts pins across all three surfaces.
  const resolution = resolveReportView(
    derived,
    reportMethodology,
    (d) => fallbackProse(d, reportMethodology),
    { audience: 'shared' },
  )

  if (!resolution.scoreable) {
    // No admin action is offered here (unlike StaleMethodologyNotice on the authenticated
    // page): GenerateButton's regenerate action is admin-only, and a public visitor holding a
    // forwarded link cannot take it. SharedStaleMethodologyNotice (report/shared.tsx) supplies
    // this branch's <h1> from ANOTHER file — exactly how <CoverCard> supplies the fresh branch's
    // <h1> below — so this file's own literal <h1> count stays 0 either way, and
    // tests/a11y/shared-report-heading.test.ts (which sums this file's <h1>s with cover.tsx's
    // and requires exactly one) holds regardless of which branch actually renders.
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md font-display text-base text-white"
            style={{ backgroundColor: row.brand_color }}
          >
            {brand.monogram}
          </div>
          <p className="font-display text-lg text-ink">{row.church_name}</p>
        </div>
        <SharedStaleMethodologyNotice />
        <p className="font-body text-sm text-ink-soft">
          Shared read-only view. This link expires and can be revoked at any time.
        </p>
      </main>
    )
  }

  const view = resolution.view

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

      <BookingCta />

      <Appendix
        categories={view.appendix.categories}
        stages={view.stages}
        benchmarkNote={view.appendix.benchmarkNote}
        dependencyNote={view.appendix.dependencyNote}
      />

      <p className="font-body text-sm text-ink-soft">
        Shared read-only view. This link expires and can be revoked at any time.
      </p>
    </main>
  )
}
