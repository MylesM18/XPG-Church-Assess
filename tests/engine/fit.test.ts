import { describe, it, expect } from 'vitest';
import { fitArea, type FitCell } from '../../lib/engine/fit';

const ITEMS = ['V1', 'V2', 'V3', 'V4', 'V5'];

function rect(rows: Record<string, number[]>): FitCell[] {
  return Object.entries(rows).flatMap(([respondent_id, values]) =>
    values.map((value, i) => ({ respondent_id, item_id: ITEMS[i]!, value })),
  );
}

describe('fitArea', () => {
  it('mu equals the pooled mean on a complete rectangle', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [6, 6, 6, 6, 6], b: [2, 4, 6, 8, 10] }));
    expect(fit.n).toBe(2);
    expect(fit.mu).toBeCloseTo(6, 10); // (30 + 30) / 10
    expect(fit.excludedPartial).toBe(0);
  });

  it('person effects sum to zero', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [8, 8, 8, 8, 8], b: [4, 4, 4, 4, 4], c: [6, 6, 6, 6, 6] }));
    const sum = fit.personEffects.reduce((s, p) => s + p.effect, 0);
    expect(sum).toBeCloseTo(0, 10);
    expect(fit.personEffects.find((p) => p.respondent_id === 'a')!.effect).toBeCloseTo(2, 10);
    expect(fit.personEffects.find((p) => p.respondent_id === 'b')!.effect).toBeCloseTo(-2, 10);
  });

  it('question effects sum to zero', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [2, 4, 6, 8, 10], b: [2, 4, 6, 8, 10] }));
    const sum = fit.questionEffects.reduce((s, q) => s + q.effect, 0);
    expect(sum).toBeCloseTo(0, 10);
    expect(fit.questionEffects.find((q) => q.item_id === 'V1')!.effect).toBeCloseTo(-4, 10);
    expect(fit.questionEffects.find((q) => q.item_id === 'V5')!.effect).toBeCloseTo(4, 10);
  });

  it('residuals are balanced along both margins', () => {
    const cells = rect({ a: [3, 7, 5, 9, 1], b: [8, 2, 6, 4, 10], c: [5, 5, 9, 1, 7] });
    const fit = fitArea('vol', ITEMS, cells);
    const person = new Map(fit.personEffects.map((p) => [p.respondent_id, p.effect]));
    const question = new Map(fit.questionEffects.map((q) => [q.item_id, q.effect]));
    const resid = (c: FitCell) =>
      c.value - fit.mu - person.get(c.respondent_id)! - question.get(c.item_id)!;

    // every respondent's residuals sum to zero
    for (const r of ['a', 'b', 'c']) {
      const rowSum = cells.filter((c) => c.respondent_id === r).reduce((s, c) => s + resid(c), 0);
      expect(rowSum).toBeCloseTo(0, 10);
    }

    // every item's residuals sum to zero
    for (const i of ITEMS) {
      const colSum = cells.filter((c) => c.item_id === i).reduce((s, c) => s + resid(c), 0);
      expect(colSum).toBeCloseTo(0, 10);
    }
  });

  it('drops partial respondents and counts them', () => {
    const cells = [
      ...rect({ pastor: [6, 6, 6, 6, 6] }),
      { respondent_id: 'elder', item_id: 'V1', value: 1 },
    ];
    const fit = fitArea('vol', ITEMS, cells);
    expect(fit.n).toBe(1);
    expect(fit.excludedPartial).toBe(1);
    expect(fit.mu).toBeCloseTo(6, 10); // NOT the pooled 5.1667
  });

  it('returns an empty fit when nobody completed the area', () => {
    const fit = fitArea('vol', ITEMS, [{ respondent_id: 'elder', item_id: 'V1', value: 1 }]);
    expect(fit.n).toBe(0);
    expect(fit.mu).toBe(0);
    expect(fit.excludedPartial).toBe(1);
    expect(fit.personEffects).toEqual([]);
    expect(fit.questionEffects).toEqual([]);
  });

  it('does not assume five items', () => {
    const fit = fitArea('x', ['A', 'B', 'C'], [
      { respondent_id: 'a', item_id: 'A', value: 4 },
      { respondent_id: 'a', item_id: 'B', value: 5 },
      { respondent_id: 'a', item_id: 'C', value: 6 },
    ]);
    expect(fit.n).toBe(1);
    expect(fit.mu).toBeCloseTo(5, 10);
    expect(fit.questionEffects).toHaveLength(3);
  });

  it('ignores a duplicate cell rather than double-counting it', () => {
    const fit = fitArea('vol', ITEMS, [
      ...rect({ a: [6, 6, 6, 6, 6] }),
      { respondent_id: 'a', item_id: 'V1', value: 10 },
    ]);
    expect(fit.n).toBe(1);
    expect(fit.mu).toBeCloseTo(6, 10);
  });
});
