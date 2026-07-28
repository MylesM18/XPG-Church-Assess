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
import { VerdictHeader } from '@/app/app/[churchId]/diagnosis/report/cover'
import { ChainWalk, EvidenceReceipt, CostSection } from '@/app/app/[churchId]/diagnosis/report/chain'
import { GatingFlags, Disagreement } from '@/app/app/[churchId]/diagnosis/report/system'
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
      <VerdictHeader
        name={row.church_name}
        brandColor={row.brand_color}
        monogram={brand.monogram}
        verdict={view.verdict}
        throughput={view.throughput}
        confidence={view.confidence}
      />

      <ChainWalk stages={view.stages} />

      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      {view.gating && <GatingFlags text={view.gating} />}
      {view.dispersion && (
        <Disagreement text={view.dispersion.text} respondents={view.dispersion.respondents} />
      )}

      {/* audience 'shared' always leaves view.nextStep undefined (lib/report/view.ts) — the CTA
          is an admin action a board member reading a forwarded link cannot take. Gated here
          anyway, deliberately, rather than relying on that invariant holding forever: this page
          does not inherit the guard from app/app/[churchId]/diagnosis/page.tsx, and nextStep
          being optional on ReportView means tsc itself refuses an ungated `.callType` access. */}
      {view.nextStep && (
        <NextStep
          callType={view.nextStep.callType}
          hook={view.nextStep.hook}
          nextStep={view.nextStep.text}
        />
      )}

      <Appendix
        diagnosis={diagnosis}
        methodology={methodology}
        benchmarkNote={view.appendix.benchmarkNote}
      />

      <p className="font-body text-sm text-ink-soft">
        Shared read-only view. This link expires and can be revoked at any time.
      </p>
    </main>
  )
}
