import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor', respondent_id: 'Pastor' }));
}

describe('fallbackProse', () => {
  it('interpolates every token (no leftover braces) for a broken chain', () => {
    const d = diagnose(
      [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
       ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
      m, { attendance_band: '500_999' },
    );
    const blocks = fallbackProse(d, m);
    for (const v of Object.values(blocks)) {
      if (typeof v === 'string') {
        expect(v.length).toBeGreaterThan(0);
        expect(v).not.toContain('{');
      }
    }
    expect(blocks.verdict).toContain('Guest Experience');
  });

  it('uses the no-constraint verdict when nothing is broken', () => {
    const d = diagnose(
      [...cat('guest', 7), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
       ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
      m, { attendance_band: '500_999' },
    );
    const blocks = fallbackProse(d, m);
    expect(blocks.verdict).toBe(m.copy.blocks.verdict_no_constraint);
    expect(blocks.cost).toBeUndefined();
    expect(blocks.next_step).not.toContain('{');
  });
});
