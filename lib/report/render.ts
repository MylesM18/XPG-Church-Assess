import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';
import type { ReportBlocks } from '../ai/fallback';

export function renderReportText(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
): string {
  const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
  const chain = methodology.rules.chain;
  const lines: string[] = [];

  lines.push(blocks.verdict);
  if (blocks.evidence) lines.push(blocks.evidence);
  if (blocks.blind_spot) lines.push(blocks.blind_spot);
  if (blocks.cost) lines.push(blocks.cost);
  if (blocks.do_not_work_on) lines.push(blocks.do_not_work_on);
  if (blocks.gating) lines.push(blocks.gating);
  if (blocks.dispersion) lines.push(blocks.dispersion);
  lines.push(blocks.next_step);

  lines.push('');
  lines.push(`Recommended next step: ${d.offer.call_type}. ${d.offer.hook}`);

  lines.push('');
  lines.push('Appendix - all category scores (0-100):');
  for (const c of d.categories) {
    const idx = chain.indexOf(c.category_id);
    const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler';
    lines.push(`- ${names.get(c.category_id) ?? c.category_id} (${tag}): ${c.score}`);
  }

  lines.push('');
  lines.push(blocks.benchmark_note);

  return lines.join('\n');
}
