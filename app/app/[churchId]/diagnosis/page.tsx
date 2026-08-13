// app/app/[churchId]/diagnosis/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadChurchForMember, loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { resolveScoreability } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import { shareLink } from '@/lib/report/share-link'
import type { Response } from '@/lib/engine/types'
import { knownLabels } from '@/lib/report/anonymity'
import { churchFactsFrom, reflectionRowsFor } from '@/lib/report/inputs-hash'
import type { AssembledSection } from '@/lib/report/compose'
import { responseHash } from '@/lib/report/response-hash'
import { resolveReportSections } from '@/lib/report/resolve'
import { readPersistedReport } from '@/lib/data/reports'
import { ReportSections } from './report/sections'
import { EmptyState, StaleMethodologyNotice } from './report/shared'
import { ShareControl } from './share-control'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

// Raw shape of one get_completed_run_responses row (supabase.rpc returns it untyped).
// respondent_user_id is null for a submission the RPC never resolved to a member id; the map
// below falls back to the label in that case, exactly as generateDiagnosis (actions.ts) does.
interface RunResponseRow {
  category_id: string
  item_id: string
  value: number
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { church, role } = await loadChurchForMember(supabase, churchId, user?.id ?? '')
  if (!church) notFound()

  // Results = admins only (Decision 5). A viewer cannot read the diagnoses row (RLS is
  // admin-only) and must not see the report page — send them back to the dashboard.
  const isAdmin = role === 'admin'
  if (!isAdmin) redirect(`/app/${churchId}`)

  // D-P4-5: catch to null so this page degrades EXACTLY as generation does. An asymmetric
  // degradation would make the two sides disagree about `profile` precisely when the
  // database is flaky — permanent silent staleness under the one condition nobody smoke-tests.
  // loadChurchForMember stays for church chrome and the admin role check.
  let churchProfile: ChurchProfile | null = null
  try {
    churchProfile = await loadChurchProfile(supabase, churchId)
  } catch {
    churchProfile = null
  }

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, status, methodology_version, completed_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // The diagnoses row is still read — but ONLY for row existence (EmptyState). Its `payload` is
  // NOT the view's source: CT-2(c) re-derives the Diagnosis from the run's responses under the
  // current methodology instead, so a payload cached under an older methodology can never drive
  // what renders.
  let diagRow: { prose: unknown } | null = null
  if (run) {
    const { data } = await supabase
      .from('diagnoses')
      .select('prose, prose_source, generated_at')
      .eq('run_id', run.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    diagRow = data
  }

  if (!diagRow) return <EmptyState churchId={churchId} />

  let existingShareToken: string | null = null
  if (isAdmin) {
    const { data: shareRows } = await supabase.rpc('get_report_share', { p_run_id: run!.id })
    const shareRow = Array.isArray(shareRows) ? shareRows[0] : null
    existingShareToken = shareRow?.token ?? null
  }

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)

  // CT-2(c): re-derive the Diagnosis from the completed run's RESPONSES under the CURRENT
  // methodology instead of trusting diagnoses.payload. These raw per-respondent rows are
  // server-side ONLY, never returned to the browser (the RPC is member-gated, and this is a
  // Server Component). respondent_id keys on respondent_user_id ?? respondent_label — the same
  // stable-identity mapping generateDiagnosis (actions.ts) uses so two nameless 'Member'
  // respondents never merge.
  const { data: rawResponses } = await supabase.rpc('get_completed_run_responses', {
    p_church_id: churchId,
  })
  const responses: Response[] = (rawResponses ?? []).map((r: RunResponseRow) => ({
    category_id: r.category_id,
    item_id: r.item_id,
    value: r.value,
    respondent_label: r.respondent_label,
    respondent_id: r.respondent_user_id ?? r.respondent_label,
  }))
  // A second, separate array from the SAME raw rows — never merged into `responses` above
  // (Response has no reflection field). No respondent identifier travels alongside: this is the
  // only reflections data that reaches a renderer, and it is deliberately keyless.
  const reflections = (rawResponses ?? []).map((r: RunResponseRow) => ({
    item_id: r.item_id,
    reflection: r.reflection,
  }))
  // ⚠️ ANONYMITY — the sibling keyed array. The array above is deliberately keyless: no
  // respondent identifier travels alongside it. The array below CARRIES respondent identity
  // (respondent_key = respondent_user_id ?? respondent_label) because the inputs hash must
  // change when a different respondent answers, not merely when the text does. Its sole
  // consumer is reportInputs. Passing it to fallbackSections, assembleReport, a component, or
  // any client boundary would leak respondent identity into the report.
  const hashReflections = reflectionRowsFor(rawResponses ?? [])

  const derived = deriveDiagnosisForRun(
    responses,
    methodology,
    { attendance_band: church.attendance_band ?? '' },
    run!.methodology_version ?? null,
  )

  // The edition the scoring actually used — the current methodology for a current-edition run, the
  // item-filtered '0.2.0' clone for a run that predates the outreach questions. The whole report is
  // built FROM it so it describes the question set this run was actually scored against. Reverting
  // this to `methodology` is wrong, not merely stylistic — lib/report/derive.ts's DeriveResult doc
  // explains the full rationale; tests/report/route-methodology-wiring.test.ts source-reads this
  // exact call site and fails immediately. The not-ok arm carries no methodology and assembles
  // nothing, so `methodology` is a never-read placeholder there.
  const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology

  // A run that cannot be scored under the current methodology (some area has no complete
  // respondent, or the church's attendance band is unset/unknown) gets a plain notice in
  // generateDiagnosis's own tone, not a half-empty report. The regenerate action is offered
  // because completing the assessment / setting the band and regenerating is exactly the fix.
  const resolution = resolveScoreability(derived)

  const notScoreableMessage = !resolution.scoreable
    ? resolution.reason === 'incomplete_areas'
      ? `This run can’t be scored yet — every area needs at least one person who answered all its questions.${
          resolution.blockedAreas.length
            ? ` Still waiting on: ${resolution.blockedAreas
                .map((id) => methodology.questions.categories.find((c) => c.id === id)?.name ?? id)
                .join(', ')}.`
            : ''
        }`
      : 'This run can’t be scored under the current methodology yet — set your church’s weekend attendance band before generating a diagnosis.'
    : null

  // Built only on the scoreable path — `resolution.diagnosis` does not exist otherwise. Stays a
  // `let` (rather than an early return) so the not-scoreable branch below can keep the page's
  // existing single-return, ternary-JSX shape.
  let sections: AssembledSection[] = []
  let stale = false

  if (resolution.scoreable) {
    // Mirrors app/app/[churchId]/actions.ts's `hash = responseHash(responses, diagnosis
    // .methodology_version)` argument-for-argument: same `responses`, and `.methodology_version`
    // read off the diagnosis object itself (never `run.methodology_version` or a methodology
    // edition's own `.questions.version`) — hash parity between generation and render depends on
    // this matching exactly, or a persisted report is judged stale forever and themes never render.
    const hash = responseHash(responses, resolution.diagnosis.methodology_version)

    // ONE label source per request, threaded through. Two label-source lookups that can
    // disagree is the labelSource finding class; the PDF guard depends on this being singular.
    const labelSource = knownLabels(responses)

    const resolved = await resolveReportSections({
      diagnosis: resolution.diagnosis,
      methodology: reportMethodology,
      responses,
      church: churchFactsFrom(churchProfile, church.name),
      // Spec §9.1: the run's own completion timestamp, not new Date() — this line is labelled
      // "assessed", and a page-load moment would change on every reload. This intentionally
      // diverges from generation's new Date().toISOString(); completedAt is not in the hash.
      completedAt: run!.completed_at,
      labelSource,
      responseHash: hash,
      reflections, // the KEYLESS array
      hashReflections, // the KEYED array — reportInputs only
      readPersisted: (inputsHash) => readPersistedReport(supabase, run!.id, inputsHash),
    })

    sections = resolved.sections
    stale = resolved.stale
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md font-display text-base text-white"
          style={{ backgroundColor: church.brand_color }}
        >
          {brand.monogram}
        </div>
        <p className="font-display text-lg text-ink">{church.name}</p>
      </div>

      {!resolution.scoreable ? (
        <StaleMethodologyNotice churchId={churchId}>{notScoreableMessage}</StaleMethodologyNotice>
      ) : (
        <>
          {stale && (
            <p className="font-body text-sm text-ink-soft">
              This report predates your latest settings change.
            </p>
          )}
          <ReportSections sections={sections} />
          <div className="flex flex-col gap-8">
            <a
              href={`/api/report/${run!.id}/pdf`}
              className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Download PDF
            </a>

            {isAdmin && (
              <ShareControl
                churchId={churchId}
                runId={run!.id}
                existingLink={existingShareToken ? shareLink(APP_URL, existingShareToken) : null}
              />
            )}
          </div>
        </>
      )}
    </main>
  )
}
