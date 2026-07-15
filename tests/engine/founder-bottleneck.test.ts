import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 3),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 3),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Founder Bottleneck (gov gate)', () => {
  it('primary constraint is volunteer', () => {
    expect(d.primary_constraint?.category_id).toBe('vol');
  });
  it('governance is a gating condition', () => {
    expect(d.gating_conditions.map(g => g.enabler_id)).toContain('gov');
  });
});
