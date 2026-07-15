import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 3),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', { GEN1: 2, GEN2: 7, GEN3: 2, GEN4: 7, GEN5: 2 }),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Faithful Remnant (breadth)', () => {
  it('primary constraint is conn', () => {
    expect(d.primary_constraint?.category_id).toBe('conn');
  });
  it('generosity is downstream and marked do-not-work-on', () => {
    expect(d.do_not_work_on.map(x => x.category_id)).toContain('gen');
  });
  it('generosity mode is breadth', () => {
    expect(d.generosity_mode).toBe('breadth');
  });
  it('offer routes to the conn belonging offer', () => {
    expect(d.offer.type).toBe('belonging');
  });
});
