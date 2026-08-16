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
// This is a Server Component and stays one: it passes only the built facts/sections to children.
// Handing raw RPC rows to a Client Component would ship data to the browser inside RSC flight.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { resolveScoreability } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import { buildFacts } from '@/lib/report/facts'
import { churchFactsFrom } from '@/lib/report/inputs-hash'
import { assembleFallbackOnly } from '@/lib/report/compose'
import { coverModel } from '@/lib/report/charts'
import { webVisuals } from '@/lib/report/web-visuals'
import { ReportSections } from '@/app/app/[churchId]/diagnosis/report/sections'
import { ReportCover } from '@/app/app/[churchId]/diagnosis/report/report-cover'
import type { Response } from '@/lib/engine/types'
import { SharedStaleMethodologyNotice } from '@/app/app/[churchId]/diagnosis/report/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Raw shape of one get_shared_run_responses row. respondent_label is redacted to '' by the RPC;
// respondent_user_id is the real (opaque) identity; attendance_band and methodology_version are
// denormalized onto every row because the anon page cannot query churches or assessment_runs.
//
// There is DELIBERATELY no `reflection` field here. Free-text reflections are excluded from the
// public share surface at multiple independent layers, and this row type is one of them: the RPC
// (get_shared_run_responses) never selects the column, this shape does not name it, and this
// page's own assembleFallbackOnly call site passes only the mandated empty `reflections: []`
// literal — never populated data. Adding a `reflection` field here would quietly undo one of
// those layers.
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
  // `methodology` is wrong, and the revert is caught, not silent — the view path reads
  // `questions.categories[].items` via buildOutreachVoices (lib/report/view.ts), so a legacy run
  // would surface outreach voices for questions it was never asked, and
  // tests/report/route-methodology-wiring.test.ts source-reads this exact call site and fails the
  // revert immediately. See lib/report/derive.ts's DeriveResult doc for the full rationale. Never
  // read on the not-ok arm — that path returns the notice below without building a view.
  const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology

  const resolution = resolveScoreability(derived)

  if (!resolution.scoreable) {
    // No admin action is offered here (unlike StaleMethodologyNotice on the authenticated
    // page): GenerateButton's regenerate action is admin-only, and a public visitor holding a
    // forwarded link cannot take it. SharedStaleMethodologyNotice (report/shared.tsx) supplies
    // this branch's <h1> from ANOTHER file — exactly how <ReportSections> supplies the fresh
    // branch's <h1> below — so this file's own literal <h1> count stays 0 either way, and
    // tests/a11y/shared-report-heading.test.ts (which sums this file's <h1>s with sections.tsx's
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

  // The public surface carries NO profile columns: the anon client cannot read them and
  // get_shared_report returns only valid/payload/church_name/brand_color. facts.profile is
  // therefore {} — profile fields are ABSENT, not empty (locked decision 6), which the
  // fallback templates already handle. Spec §9.2.
  const facts = buildFacts({
    diagnosis: resolution.diagnosis,
    methodology: reportMethodology,
    responses,
    church: churchFactsFrom(null, row.church_name),
    // Spec §9.1: no completion timestamp is reachable here without a migration, so S1 reads
    // "assessed not yet completed" on the public surface. Fixing it is a plan-5 follow-up.
    completedAt: null,
    // D-P4-4: the literal redacted variant, never knownLabels(responses).
    // get_shared_run_responses redacts respondent_label to the empty string, and
    // containsRespondentLabel skips empty needles — so knownLabels() here would build a
    // guard over [] that guards NOTHING. The observable difference today is ZERO
    // (ChurchFacts is name-only, so facts.profile === {} either way). This is fail-closed
    // permanence: the moment plan 5 gives this page a real profile, { kind: 'known',
    // labels: [] } would silently unguard every free-text field.
    labelSource: { kind: 'redacted' },
  })

  // Structural exclusion, visible at the call site: the public report never receives
  // reflections. FallbackSectionArgs REQUIRES the field, so an empty literal is the
  // exclusion — there is no conditional to get wrong, because the data never enters.
  const sections = assembleFallbackOnly({
    facts,
    methodology: reportMethodology,
    reflections: [],
  })

  const visuals = webVisuals(facts, reportMethodology)

  // The cover exactly as lib/report/resolve.ts derives it (coverModel(facts, methodology)),
  // from the facts + effective methodology this page already built — no new data access, no
  // extra RPC. No completion timestamp is reachable on this surface (see completedAt: null
  // above), so the cover renders without a date line.
  const cover = coverModel(facts, reportMethodology)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      {/* The monogram + church name live inside the cover now. Its church name is a <p>, not
          a heading: ReportSections below renders the page's one true <h1> (the first section
          opener) — tests/a11y/shared-report-heading.test.ts pins exactly one <h1> on this
          public page, and the booking CTA rides inside ReportSections after s12. */}
      <ReportCover
        cover={cover}
        churchName={row.church_name}
        brandColor={row.brand_color}
        monogram={brand.monogram}
        dateLabel={null}
      />

      <div className="flex flex-col gap-10">
        <ReportSections sections={sections} band={cover.band} visuals={visuals} />
      </div>

      <p className="font-body text-sm text-ink-soft">
        Shared read-only view. This link expires and can be revoked at any time.
      </p>
    </main>
  )
}
