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
  it('capacity is the 8-area mean; throughput is dragged down by the vol bottleneck', () => {
    // chain scores (guest,conn,disc,vol,gen) = [70,70,70,30,70]; min=30, mean=62
    // throughput = round(0.85*30 + 0.15*62) = round(25.5 + 9.3) = round(34.8) = 35
    // capacity = mean of all 8 = (70+70+70+30+70+30+70+70)/8 = 480/8 = 60
    expect(d.capacity).toBe(60);
    expect(d.throughput).toBe(35);
  });
  it('governance is a gating condition', () => {
    expect(d.gating_conditions.map(g => g.enabler_id)).toContain('gov');
  });
});
