// app/app/[churchId]/diagnosis/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { resolveReportView } from '@/lib/report/view'
import { shareLink } from '@/lib/report/share-link'
import type { Diagnosis } from '@/lib/engine/types'
import { EmptyState, ReportBody, StaleMethodologyNotice } from './report/shared'
import { ShareControl } from './share-control'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()
  if (!church) notFound()

  // Results = admins only (Decision 5). A viewer cannot read the diagnoses row (RLS is
  // admin-only) and must not see the report page — send them back to the dashboard.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user?.id ?? '').maybeSingle()
  const isAdmin = membership?.role === 'admin'
  if (!isAdmin) redirect(`/app/${churchId}`)

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, status')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let diagRow: { payload: unknown; prose: unknown } | null = null
  if (run) {
    const { data } = await supabase
      .from('diagnoses')
      .select('payload, prose, prose_source, generated_at')
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

  const diagnosis = diagRow.payload as Diagnosis
  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)

  // diagnoses.payload is cached JSONB — a pre-reform row's methodology_version does not match
  // methodology.questions.version and carries the OLD Diagnosis shape at runtime (overall_score/
  // dispersion_flags, never throughput/disagreement_flags). resolveReportView (lib/report/view.ts)
  // makes that comparison BEFORE fallbackProse or buildReportView ever run — calling either on a
  // stale payload throws (CT-1) — so `blocks` below is only ever evaluated when versions match.
  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  const resolution = resolveReportView(
    diagnosis,
    methodology,
    () =>
      PROSE_MODE !== 'fallback' && diagRow.prose
        ? (diagRow.prose as ReportBlocks)
        : fallbackProse(diagnosis, methodology),
    { audience: 'screen' },
  )

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
          re-derives the same stale-vs-fresh comparison from storedVersion/currentVersion
          (redundant with `resolution.stale` here by construction, kept as defense in depth —
          tests/report/components.test.ts unit-tests that branch directly), but it is only ever
          reached once `resolution.view` is guaranteed non-null. */}
      {resolution.stale ? (
        <StaleMethodologyNotice churchId={churchId}>
          This report predates the current methodology — regenerate to see the new analysis
        </StaleMethodologyNotice>
      ) : (
        <ReportBody
          storedVersion={diagnosis.methodology_version}
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
