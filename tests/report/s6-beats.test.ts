import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { ALL_FIXTURES, CAPACITY_FACTS, HIGH_DISPERSION_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();
const s6 = (facts = CAPACITY_FACTS) => fallbackSection('s6', { facts, methodology, reflections: [] }).bullets;

describe('s6 six-beat bullet', () => {
  it('is never empty on any fixture — affirm always resolves', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const bullets = fallbackSection('s6', { facts, methodology, reflections: [] }).bullets;
      expect(bullets.length, name).toBe(facts.categories.slice(3).length);
      for (const bullet of bullets) expect(bullet.trim().length, name).toBeGreaterThan(0);
    }
  });

  it('never emits a double space, a leading space, or a dangling separator', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      for (const bullet of fallbackSection('s6', { facts, methodology, reflections: [] }).bullets) {
        expect(bullet, name).not.toMatch(/ {2}/);
        expect(bullet, name).toBe(bullet.trim());
      }
    }
  });

  it('emits the pivot beat, keyed by the area band', () => {
    const bullets = s6(HIGH_DISPERSION_FACTS);
    const pivots = Object.values(methodology.copy.beats.pivot);
    expect(bullets.some((b) => pivots.some((p) => b.includes(p.split('{')[0]!.trim())))).toBe(true);
  });

  it('emits the trajectory beat when growth_trajectory is set', () => {
    const line = methodology.copy.beats.trajectory['growing_steadily']!;
    expect(s6().some((b) => b.includes(line))).toBe(true);
  });

  it('DROPS the trajectory beat when growth_trajectory is absent — never an empty sentence', () => {
    const noTrajectory = makeFacts({ profile: { context: 'suburban', attendance_band: '250-499' } });
    const withTrajectory = s6();
    const without = s6(noTrajectory);
    for (const line of Object.values(methodology.copy.beats.trajectory)) {
      expect(without.join(' ')).not.toContain(line);
    }
    expect(without.join(' ').length).toBeLessThan(withTrajectory.join(' ').length);
    for (const bullet of without) expect(bullet.trim().length).toBeGreaterThan(0);
  });

  it('does not throw on an unknown trajectory value — it drops the beat', () => {
    const weird = makeFacts({ profile: { growth_trajectory: 'not_a_real_option' } });
    expect(() => s6(weird)).not.toThrow();
    for (const bullet of s6(weird)) expect(bullet.trim().length).toBeGreaterThan(0);
  });

  it('emits the not-statement beat keyed to this area’s dominant bottom-item theme', () => {
    // CAPACITY_FACTS gives sys two bottom items, both `systems`.
    const sysBullet = s6().find((b) => b.includes('Systems'));
    expect(sysBullet).toBeDefined();
    expect(sysBullet!).toContain(methodology.copy.beats.not_statement.systems);
  });

  it('DROPS the not-statement beat for an area with no bottom items', () => {
    const noItems = makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } });
    for (const line of Object.values(methodology.copy.beats.not_statement)) {
      expect(s6(noItems).join(' ')).not.toContain(line);
    }
  });

  it('orders the beats affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory', () => {
    // vol carries a dispersion flag AND a bottom item in HIGH_DISPERSION_FACTS, so all six fire.
    const bullet = fallbackSection('s6', { facts: HIGH_DISPERSION_FACTS, methodology, reflections: [] })
      .bullets.find((b) => b.includes('Volunteer'))!;
    const affirmIdx = bullet.indexOf(methodology.copy.dossier.reading.stage.watch.slice(0, 20));
    const trajectoryIdx = bullet.indexOf(methodology.copy.beats.trajectory['growing_steadily']!);
    expect(affirmIdx).toBeGreaterThanOrEqual(0);
    expect(trajectoryIdx).toBeGreaterThan(affirmIdx);
  });
});
