// app/app/[churchId]/diagnosis/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { chainWalk } from '@/lib/report/chain-walk'
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

  const stages = chainWalk(diagnosis, methodology)

  const primaryId = diagnosis.primary_constraint?.category_id ?? null
  const receipt = primaryId
    ? diagnosis.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined
  const dispersion = diagnosis.dispersion_flags[0]

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={church.name}
        brandColor={church.brand_color}
        monogram={brand.monogram}
        verdict={blocks.verdict}
        overallScore={diagnosis.overall_score}
        confidence={diagnosis.confidence}
      />

      <ChainWalk stages={stages} />

      {blocks.evidence && <EvidenceReceipt text={blocks.evidence} refs={receipt?.refs ?? []} />}
      {blocks.blind_spot && <BlindSpots text={blocks.blind_spot} />}
      {blocks.cost && <CostSection cost={blocks.cost} doNotWorkOn={blocks.do_not_work_on} />}
      {blocks.gating && <GatingFlags text={blocks.gating} />}
      {diagnosis.generosity_mode !== null && <GenerositySplit mode={diagnosis.generosity_mode} />}
      {blocks.dispersion && (
        <Disagreement text={blocks.dispersion} respondents={dispersion?.respondents ?? []} />
      )}

      <NextStep
        callType={diagnosis.offer.call_type}
        hook={diagnosis.offer.hook}
        nextStep={blocks.next_step}
      />

      <Appendix diagnosis={diagnosis} methodology={methodology} benchmarkNote={blocks.benchmark_note} />
    </main>
  )
}
