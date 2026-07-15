import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import { renderReportText } from '../../lib/report/render';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor' }));
}
const d = diagnose(
  [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
   ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
  m, { attendance_band: '500_999' },
);
const text = renderReportText(d, fallbackProse(d, m), m);

describe('renderReportText', () => {
  it('includes the primary name and the offer call type', () => {
    expect(text).toContain('Guest Experience');
    expect(text).toContain(d.offer.call_type);
  });
  it('has an appendix line for every category and states the priors basis', () => {
    for (const c of m.questions.categories) expect(text).toContain(c.name);
    expect(text.toLowerCase()).toContain('prior');
  });
  it('leaves no un-interpolated tokens', () => {
    expect(text).not.toContain('{');
  });
});
