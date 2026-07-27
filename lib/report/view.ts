import type { Diagnosis, DiagnosisCategory, EvidenceRef, GenerosityMode } from '../engine/types';
import type { ReportBlocks } from '../ai/fallback';
import type { Methodology } from '../methodology/schema';
import { chainWalk, type StageView } from './chain-walk';

export type ReportAudience = 'screen' | 'pdf' | 'shared';

export interface ReportView {
  verdict: string;
  throughput: number;
  capacity: number;
  gap: number;
  confidence: number;
  stages: StageView[];
  evidence?: { text: string; refs: EvidenceRef[] };
  blindSpot?: string;
  cost?: { cost: string; doNotWorkOn?: string };
  gating?: string;
  generosityMode: GenerosityMode;
  dispersion?: { text: string; respondents: Array<{ label: string; mean: number }> };
  nextStep?: { callType: string; hook: string; text: string };
  appendix: { categories: Array<DiagnosisCategory & { name: string }>; benchmarkNote: string };
}

/**
 * Resolves everything both report surfaces need, once. The page and the PDF
 * document consume this so section content and ordering cannot drift apart;
 * only layout primitives differ between them.
 *
 * audience 'pdf' and 'shared' both empty dispersion.respondents. Each leaves the
 * permission wall, so the per-person name-to-score list must not travel with
 * them. The field stays present-but-empty so the narrative still renders.
 *
 * audience 'shared' additionally drops nextStep: the CTA is an admin action, and
 * a board member reading a forwarded link cannot take it.
 */
export function buildReportView(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
  opts: { audience: ReportAudience },
): ReportView {
  const primaryId = d.primary_constraint?.category_id ?? null;

  const receipt = primaryId
    ? d.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined;

  const flag = d.dispersion_flags[0];

  // Same resolution pattern chain-walk.ts uses, so the chain section and the
  // appendix never disagree on how a category_id is displayed.
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));

  return {
    verdict: blocks.verdict,
    throughput: d.throughput,
    capacity: d.capacity,
    gap: d.gap,
    confidence: d.confidence,
    stages: chainWalk(d, methodology),

    evidence: blocks.evidence
      ? { text: blocks.evidence, refs: receipt?.refs ?? [] }
      : undefined,

    blindSpot: blocks.blind_spot,

    cost: blocks.cost
      ? { cost: blocks.cost, doNotWorkOn: blocks.do_not_work_on }
      : undefined,

    gating: blocks.gating,
    generosityMode: d.generosity_mode,

    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents:
            opts.audience === 'pdf' || opts.audience === 'shared'
              ? []
              : (flag?.respondents ?? []),
        }
      : undefined,

    nextStep:
      opts.audience === 'shared'
        ? undefined
        : { callType: d.offer.call_type, hook: d.offer.hook, text: blocks.next_step },
    appendix: {
      categories: d.categories.map((c) => ({ ...c, name: names.get(c.category_id) ?? c.category_id })),
      benchmarkNote: blocks.benchmark_note,
    },
  };
}
