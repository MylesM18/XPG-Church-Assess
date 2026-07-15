import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import { renderReportText } from '../../lib/report/render';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Healthy Church (NO_STRUCTURAL_CONSTRAINT)', () => {
  it('has no primary constraint and no do-not-work-on', () => {
    expect(d.primary_constraint).toBeNull();
    expect(d.do_not_work_on).toEqual([]);
  });
  it('offers the capacity conversation', () => {
    expect(d.offer.type).toBe('capacity');
  });
  it('invents no blind spot', () => {
    expect(d.blind_spots).toEqual([]);
  });

  it('renders a full report with PROSE_MODE=fallback (M1 acceptance)', () => {
    const text = renderReportText(d, fallbackProse(d, m), m);
    expect(text).not.toContain('{'); // every token interpolated
    expect(text.toLowerCase()).toContain('capacity'); // no-constraint verdict / capacity offer
    expect(text).toContain(d.offer.call_type);
    for (const c of m.questions.categories) expect(text).toContain(c.name); // appendix
    expect(text.toLowerCase()).toContain('prior'); // benchmarks are provisional priors
  });
});
