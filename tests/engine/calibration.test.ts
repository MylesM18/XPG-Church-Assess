import { describe, it, expect } from 'vitest';
import { calibrationFrom, deviationsFor } from '../../lib/engine/calibration';
import type { AreaFit } from '../../lib/engine/fit';

function fitOf(category_id: string, effects: Record<string, number>): AreaFit {
  return {
    category_id,
    mu: 5,
    n: Object.keys(effects).length,
    personEffects: Object.entries(effects).map(([respondent_id, effect]) => ({ respondent_id, effect })),
    questionEffects: [],
    excludedPartial: 0,
  };
}

describe('calibration', () => {
  it('style is the mean of a person effects across the areas they completed', () => {
    const c = calibrationFrom([
      fitOf('guest', { generous: 1.5, harsh: -1.5 }),
      fitOf('conn', { generous: 1.3, harsh: -1.3 }),
    ]);
    expect(c.people.find((p) => p.respondent_id === 'generous')!.style).toBeCloseTo(1.4, 10);
    expect(c.people.find((p) => p.respondent_id === 'harsh')!.style).toBeCloseTo(-1.4, 10);
    expect(c.people.find((p) => p.respondent_id === 'generous')!.areasCompleted).toBe(2);
  });

  it('averages only over areas the person actually completed', () => {
    const c = calibrationFrom([
      fitOf('guest', { a: 2, b: 0 }),
      fitOf('conn', { b: 0 }), // a did not complete conn
    ]);
    expect(c.people.find((p) => p.respondent_id === 'a')!.style).toBeCloseTo(2, 10);
    expect(c.people.find((p) => p.respondent_id === 'a')!.areasCompleted).toBe(1);
  });

  it('spread is the stddev of style', () => {
    const c = calibrationFrom([fitOf('guest', { a: 2, b: -2 })]);
    expect(c.spread).toBeCloseTo(2, 10);
  });

  it('a consistent rater deviates from their own style by zero', () => {
    const guest = fitOf('guest', { generous: 1.4, harsh: -1.4 });
    const c = calibrationFrom([guest, fitOf('conn', { generous: 1.4, harsh: -1.4 })]);
    const d = deviationsFor(guest, c);
    expect(d.find((x) => x.respondent_id === 'generous')!.deviation).toBeCloseTo(0, 10);
    expect(d.find((x) => x.respondent_id === 'harsh')!.deviation).toBeCloseTo(0, 10);
  });

  it('an area-specific opinion shows up as a non-zero deviation', () => {
    const vol = fitOf('vol', { generous: -2.6, harsh: -1.4 }); // generous suddenly harsh on vol
    const c = calibrationFrom([fitOf('guest', { generous: 1.4, harsh: -1.4 }), vol]);
    // generous style = (1.4 + -2.6) / 2 = -0.6 ; deviation on vol = -2.6 - -0.6 = -2.0
    expect(deviationsFor(vol, c).find((x) => x.respondent_id === 'generous')!.deviation)
      .toBeCloseTo(-2, 10);
  });

  it('returns an empty calibration for no fits', () => {
    const c = calibrationFrom([]);
    expect(c.people).toEqual([]);
    expect(c.spread).toBe(0);
  });
});
