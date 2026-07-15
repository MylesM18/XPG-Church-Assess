import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 8, 'Pastor A'),
    ...answers(m, 'disc', 3, 'Pastor B'),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Disagreement (dispersion)', () => {
  it('flags discipleship dispersion with both respondents', () => {
    const f = d.dispersion_flags.find(x => x.category_id === 'disc');
    expect(f).toBeTruthy();
    expect(f!.spread).toBeCloseTo(2.5, 5);
    expect(f!.respondents.map(r => r.label).sort()).toEqual(['Pastor A', 'Pastor B']);
  });
  it('the chain is otherwise healthy (dispersion is the story)', () => {
    expect(d.primary_constraint).toBeNull();
  });
});
