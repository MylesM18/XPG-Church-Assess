import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { scoreFromFit, fitArea } from '../../lib/engine/fit';

describe('a partial respondent no longer outweighs a complete one', () => {
  const methodology = loadFixtureMethodology();

  it('scores 60, not the pooled 52, when an elder answered one item of five', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      ...partialAnswers(methodology, 'vol', ['V1'], 1, 'Elder'),
    ];
    const vol = normalize(responses, methodology).get('vol')!;

    // pooled mean would be (6*5 + 1) / 6 = 5.1667 -> 52, below thresholds.break (45 is
    // not crossed here, but the five-point drag is the unfairness). The fair answer
    // counts people, not answers: only the pastor completed the area.
    expect(scoreFromFit(vol.fit)).toBe(60);
    expect(vol.fit.n).toBe(1);
    expect(vol.fit.excludedPartial).toBe(1);
  });

  it('counts both people once the elder finishes', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      ...answers(methodology, 'vol', 1, 'Elder'),
    ];
    const vol = normalize(responses, methodology).get('vol')!;
    expect(scoreFromFit(vol.fit)).toBe(35); // (6 + 1) / 2 = 3.5
    expect(vol.fit.n).toBe(2);
    expect(vol.fit.excludedPartial).toBe(0);
  });
});

describe('cells from another area never reach this area fit', () => {
  const methodology = loadFixtureMethodology();

  it('ignores rows for a different category when normalizing', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      ...answers(methodology, 'guest', 2, 'Pastor'),
    ];
    const byCat = normalize(responses, methodology);

    // Pooling the two areas together would give mu 4 -> 40. Each area sees only its own.
    const vol = byCat.get('vol')!;
    expect(vol.fit.n).toBe(1);
    expect(vol.fit.excludedPartial).toBe(0);
    expect(scoreFromFit(vol.fit)).toBe(60);

    const guest = byCat.get('guest')!;
    expect(guest.fit.n).toBe(1);
    expect(scoreFromFit(guest.fit)).toBe(20);
  });

  it('ignores a cell whose item belongs to another area', () => {
    // Guards fitArea's unknown-item filter directly: normalize() screens foreign
    // items out before they become cells, so only a direct call can reach it.
    const fit = fitArea('vol', ['V1', 'V2', 'V3', 'V4', 'V5'], [
      { respondent_id: 'r1', item_id: 'V1', value: 4 },
      { respondent_id: 'r1', item_id: 'V2', value: 5 },
      { respondent_id: 'r1', item_id: 'V3', value: 6 },
      { respondent_id: 'r1', item_id: 'V4', value: 7 },
      { respondent_id: 'r1', item_id: 'V5', value: 8 },
      { respondent_id: 'r1', item_id: 'G1', value: 1 },
    ]);

    // Without the filter the foreign cell makes r1's row 6 wide, so r1 stops
    // counting as complete and the area collapses to n 0 / mu 0.
    expect(fit.n).toBe(1);
    expect(fit.excludedPartial).toBe(0);
    expect(fit.mu).toBe(6);
    expect(scoreFromFit(fit)).toBe(60);
  });

  it('ignores a row tagged to another category even when the item is ours', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      // Mistagged: V1 is a vol item, but this row claims to be a guest answer.
      // normalize()'s bucket lookup cannot catch this one — only the category
      // guard can, because V1 IS a real key in vol's itemValues map.
      { category_id: 'guest', item_id: 'V1', value: 1, respondent_label: 'Ghost', respondent_id: 'Ghost' },
    ];
    const vol = normalize(responses, methodology).get('vol')!;

    // Without the category guard, Ghost lands in vol as a 1-of-5 partial
    // respondent: excludedPartial goes to 1 and respondentCount to 2.
    expect(vol.fit.n).toBe(1);
    expect(vol.fit.excludedPartial).toBe(0);
    expect(vol.respondentCount).toBe(1);
    expect(scoreFromFit(vol.fit)).toBe(60);
  });
});
