import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { scoreFromFit } from '../../lib/engine/fit';

describe('area score', () => {
  const methodology = loadFixtureMethodology();
  const pooled = (rows: { value: number }[]) =>
    Math.round((rows.reduce((a, r) => a + r.value, 0) / rows.length) * 10);

  it('equals the pooled mean when every respondent completed the area', () => {
    const rows = [
      ...answers(methodology, 'guest', { G1: 8, G2: 6, G3: 7, G4: 9, G5: 5 }, 'Pastor'),
      ...answers(methodology, 'guest', { G1: 4, G2: 5, G3: 6, G4: 3, G5: 7 }, 'Elder'),
    ];
    const guest = normalize(rows, methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(pooled(rows));
  });

  it('diverges from the pooled mean exactly when someone is partial', () => {
    const rows = [
      ...answers(methodology, 'guest', 6, 'Pastor'),
      ...partialAnswers(methodology, 'guest', ['G1'], 1, 'Elder'),
    ];
    const guest = normalize(rows, methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(60);
    expect(scoreFromFit(guest.fit)).not.toBe(pooled(rows));
  });

  it('scores 0 when nobody completed the area', () => {
    const guest = normalize([], methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(0);
  });
});
