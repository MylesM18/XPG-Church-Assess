import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', { G1: 2, G2: 2, G3: 8, G4: 2, G5: 2 }),
    ...answers(m, 'conn', 3),
    ...answers(m, 'disc', 3),
    ...answers(m, 'vol', 3),
    ...answers(m, 'gen', 3),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Leaky Bucket', () => {
  it('primary constraint is guest', () => {
    expect(d.primary_constraint?.category_id).toBe('guest');
  });
  it('guest is a blind spot (belief far above evidence)', () => {
    expect(d.blind_spots.map(b => b.category_id)).toContain('guest');
    const gbs = d.blind_spots.find(b => b.category_id === 'guest')!;
    expect(gbs.belief).toBeGreaterThan(gbs.evidence);
  });
  it('offer is guest retention', () => {
    expect(d.offer.type).toBe('guest_retention');
  });
});
