// app/app/[churchId]/diagnosis/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadChurchForMember } from '@/lib/data/churches'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { resolveReportView } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import { shareLink } from '@/lib/report/share-link'
import type { Response } from '@/lib/engine/types'
import { EmptyState, ReportBody, StaleMethodologyNotice } from './report/shared'
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

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, status')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // The diagnoses row is still read — but ONLY for AI `prose` (fed to the lazy thunk below) and
  // for row existence (EmptyState). Its `payload` is NO LONGER the view's source: CT-2(c)
  // re-derives the Diagnosis from the run's responses under the current methodology instead, so a
  // payload cached under an older methodology can never drive what renders.
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
  const derived = deriveDiagnosisForRun(responses, methodology, {
    attendance_band: church.attendance_band ?? '',
  })

  // `blocks` stays a lazy thunk taking the FRESH diagnosis — it is only evaluated on the
  // scoreable path (resolveReportView, lib/report/view.ts). PROSE_MODE gates the AI prose read
  // exactly as generateDiagnosis's write gate does; unset → deterministic fallbackProse.
  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  const resolution = resolveReportView(
    derived,
    methodology,
    (d) =>
      PROSE_MODE !== 'fallback' && diagRow.prose
        ? (diagRow.prose as ReportBlocks)
        : fallbackProse(d, methodology),
    { audience: 'screen' },
  )

  // A run that cannot be scored under the current methodology (some area has no complete
  // respondent, or the church's attendance band is unset/unknown) gets a plain notice in
  // generateDiagnosis's own tone, not a half-empty report. The regenerate action is offered
  // because completing the assessment / setting the band and regenerating is exactly the fix.
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

      {/* The PDF/Share controls are passed in as layer1Actions rather than rendered here
          directly, so they land at the spec §7 Layer 1 position (after AreaTable, before
          ChainWalk) instead of above the whole report — they need run.id/isAdmin/the share
          token, which is why they're built here and not inside ReportBody itself. ReportBody
          re-derives the same stored-vs-current comparison from storedVersion/currentVersion
          (kept as defense in depth — tests/report/components.test.ts unit-tests that branch
          directly), but under CT-2(c) the view is re-derived from responses, so storedVersion
          and currentVersion are the same value and the fresh branch always renders here. */}
      {!resolution.scoreable ? (
        <StaleMethodologyNotice churchId={churchId}>{notScoreableMessage}</StaleMethodologyNotice>
      ) : (
        <ReportBody
          storedVersion={methodology.questions.version}
          currentVersion={methodology.questions.version}
          view={resolution.view}
          churchId={churchId}
          layer1Actions={
            <div className="flex flex-col gap-4">
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
          }
        />
      )}
    </main>
  )
}
