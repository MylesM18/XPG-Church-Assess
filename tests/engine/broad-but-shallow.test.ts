import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', { GEN1: 7, GEN2: 2, GEN3: 2, GEN4: 2, GEN5: 2 }),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Broad but Shallow (depth)', () => {
  it('primary constraint is generosity', () => {
    expect(d.primary_constraint?.category_id).toBe('gen');
  });
  it('capacity is the 8-area mean; throughput is dragged down by the gen bottleneck', () => {
    // chain scores (guest,conn,disc,vol,gen) = [70,70,70,70,30]; min=30, mean=62
    // throughput = round(0.85*30 + 0.15*62) = round(25.5 + 9.3) = round(34.8) = 35
    // capacity = mean of all 8 = (70+70+70+70+30+70+70+70)/8 = 520/8 = 65
    expect(d.capacity).toBe(65);
    expect(d.throughput).toBe(35);
  });
  it('generosity mode is depth', () => {
    expect(d.generosity_mode).toBe('depth');
  });
  it('offer is the generosity depth call', () => {
    expect(d.offer.call_type).toBe('Generosity Culture & Discipleship Review');
  });
});
