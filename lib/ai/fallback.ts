import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';

export interface ReportBlocks {
  verdict: string;
  evidence?: string;
  blind_spot?: string;
  cost?: string;
  do_not_work_on?: string;
  next_step: string;
  gating?: string;
  dispersion?: string;
  benchmark_note: string;
}

function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? vars[k]! : `{${k}}`));
}

function listJoin(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function fallbackProse(d: Diagnosis, methodology: Methodology): ReportBlocks {
  const { blocks, inserts } = methodology.copy;
  const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const benchmark_note = inserts.benchmark_note!;

  if (!d.primary_constraint) {
    return {
      verdict: blocks.verdict_no_constraint!,
      next_step: interp(blocks.next_step!, { primary_name: 'your next ceiling', offer_hook: d.offer.hook }),
      benchmark_note,
    };
  }

  const primaryId = d.primary_constraint.category_id;
  const primaryName = nameOf(primaryId);
  const primaryCat = d.categories.find(c => c.category_id === primaryId)!;

  const primaryReceipt = d.evidence_trail.find(r => r.claim === `primary_constraint:${primaryId}`);
  const evidence_lines = primaryReceipt
    ? primaryReceipt.refs.map(r => `${r.ref} ${r.value ?? 'n/a'}`).join(', ')
    : 'the item-level scores for this stage';

  const verdict = interp(blocks.verdict!, { primary_name: primaryName, primary_score: String(primaryCat.score) });
  const evidence = interp(blocks.evidence!, { evidence_lines });

  let blind_spot: string | undefined;
  const bs = d.blind_spots.find(b => b.category_id === primaryId) ?? d.blind_spots[0];
  if (bs) {
    blind_spot = interp(blocks.blind_spot!, {
      bs_name: nameOf(bs.category_id),
      bs_belief: String(bs.belief),
      bs_evidence: String(bs.evidence),
      bs_gap: String(bs.gap),
    });
  }

  const downstreamNames = d.do_not_work_on.map(x => nameOf(x.category_id));
  const cost = interp(blocks.cost!, {
    primary_name: primaryName,
    downstream_list: downstreamNames.length ? listJoin(downstreamNames) : 'the stages downstream',
  });

  const do_not_work_on = downstreamNames.length
    ? interp(blocks.do_not_work_on!, { do_not_list: listJoin(downstreamNames) })
    : undefined;

  const gating = d.gating_conditions.length
    ? interp(inserts.gating!, { gating_list: listJoin(d.gating_conditions.map(g => nameOf(g.enabler_id))) })
    : undefined;

  const disp = d.dispersion_flags[0];
  const dispersion = disp
    ? interp(inserts.dispersion!, { disp_name: nameOf(disp.category_id), disp_spread: String(disp.spread) })
    : undefined;

  const next_step = interp(blocks.next_step!, { primary_name: primaryName, offer_hook: d.offer.hook });

  return { verdict, evidence, blind_spot, cost, do_not_work_on, next_step, gating, dispersion, benchmark_note };
}
