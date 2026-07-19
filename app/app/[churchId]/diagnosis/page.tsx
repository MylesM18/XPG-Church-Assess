// app/app/[churchId]/diagnosis/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { buildReportView } from '@/lib/report/view'
import type { Diagnosis } from '@/lib/engine/types'
import {
  EmptyState,
  VerdictHeader,
  ChainWalk,
  EvidenceReceipt,
  BlindSpots,
  CostSection,
  GatingFlags,
  GenerositySplit,
  Disagreement,
  NextStep,
  Appendix,
} from './report'

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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={church.name}
        brandColor={church.brand_color}
        monogram={brand.monogram}
        verdict={view.verdict}
        overallScore={view.overallScore}
        confidence={view.confidence}
      />

      <a
        href={`/api/report/${run!.id}/pdf`}
        className="font-body text-sm text-ink-soft underline underline-offset-4"
      >
        Download PDF
      </a>

      <ChainWalk stages={view.stages} />

      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.blindSpot && <BlindSpots text={view.blindSpot} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      {view.gating && <GatingFlags text={view.gating} />}
      {view.generosityMode !== null && <GenerositySplit mode={view.generosityMode} />}
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
