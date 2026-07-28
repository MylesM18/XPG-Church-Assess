// app/app/[churchId]/diagnosis/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { buildReportView } from '@/lib/report/view'
import { shareLink } from '@/lib/report/share-link'
import type { Diagnosis } from '@/lib/engine/types'
import {
  EmptyState,
  VerdictHeader,
  ChainWalk,
  EvidenceReceipt,
  CostSection,
  GatingFlags,
  Disagreement,
  NextStep,
  Appendix,
} from './report'
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

  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  const blocks: ReportBlocks =
    PROSE_MODE !== 'fallback' && diagRow.prose
      ? (diagRow.prose as ReportBlocks)
      : fallbackProse(diagnosis, methodology)

  const view = buildReportView(diagnosis, blocks, methodology, { audience: 'screen' })

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={church.name}
        brandColor={church.brand_color}
        monogram={brand.monogram}
        verdict={view.verdict}
        throughput={view.throughput}
        confidence={view.confidence}
      />

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

      <ChainWalk stages={view.stages} />

      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      {view.gating && <GatingFlags text={view.gating} />}
      {view.dispersion && (
        <Disagreement text={view.dispersion.text} respondents={view.dispersion.respondents} />
      )}

      {view.nextStep && (
        <NextStep
          callType={view.nextStep.callType}
          hook={view.nextStep.hook}
          nextStep={view.nextStep.text}
        />
      )}

      <Appendix diagnosis={diagnosis} methodology={methodology} benchmarkNote={view.appendix.benchmarkNote} />
    </main>
  )
}
