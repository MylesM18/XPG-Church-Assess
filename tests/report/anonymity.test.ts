import { describe, expect, it } from 'vitest';
import { containsRespondentLabel, respondentLabels } from '../../lib/report/anonymity';
import { knownLabels } from '@/lib/report/anonymity';

describe('respondentLabels', () => {
  it('returns distinct labels', () => {
    const rows = [
      { respondent_label: 'Priscilla Vandermeer' },
      { respondent_label: 'Priscilla Vandermeer' },
      { respondent_label: 'Dana Okafor' },
    ];
    expect(respondentLabels(rows).sort()).toEqual(['Dana Okafor', 'Priscilla Vandermeer']);
  });

  it('drops blank and whitespace-only labels', () => {
    // A blank label is the trap this function exists to defuse: '' is a substring of
    // every string, so letting it through would make containsRespondentLabel return
    // true for all input and silently drop every theme and every profile field.
    const rows = [
      { respondent_label: '' },
      { respondent_label: '   ' },
      { respondent_label: 'Dana Okafor' },
    ];
    expect(respondentLabels(rows)).toEqual(['Dana Okafor']);
  });

  it('returns an empty array for no responses', () => {
    expect(respondentLabels([])).toEqual([]);
  });
});

describe('containsRespondentLabel', () => {
  const labels = ['Priscilla Vandermeer', 'Dana Okafor'];

  it('matches a full label case-insensitively', () => {
    expect(containsRespondentLabel('as PRISCILLA VANDERMEER put it', labels)).toBe(true);
  });

  it('does not match a partial label', () => {
    // Documented scope, identical to lib/ai/prose.ts's check 5: exact full labels only.
    // 'Priscilla', 'Vandermeer' and 'P. Vandermeer' all pass. This is NOT a general PII
    // filter and must not be trusted as one.
    expect(containsRespondentLabel('Priscilla said so', labels)).toBe(false);
    expect(containsRespondentLabel('per Vandermeer', labels)).toBe(false);
  });

  it('returns false when the label list is empty', () => {
    expect(containsRespondentLabel('anything at all', [])).toBe(false);
  });

  it('returns false for an empty text', () => {
    expect(containsRespondentLabel('', labels)).toBe(false);
  });

  it('ignores a blank entry that reached the label list anyway', () => {
    // Defense in depth: respondentLabels already strips these, but this function is
    // exported and a caller may build a list by hand.
    expect(containsRespondentLabel('nothing identifying here', ['', '  '])).toBe(false);
  });
});

describe('knownLabels', () => {
  it('wraps the derived labels in a known LabelSource', () => {
    const src = knownLabels([{ respondent_label: 'Priscilla Vandermeer' }, { respondent_label: 'Tom Ng' }]);
    expect(src).toEqual({ kind: 'known', labels: ['Priscilla Vandermeer', 'Tom Ng'] });
  });

  it('returns a known source with an empty list rather than a redacted one when every label is blank', () => {
    // The share RPC emits ''::text. knownLabels must NOT silently promote that to 'redacted' —
    // the caller decides which source it is holding; this function only reports what it saw.
    expect(knownLabels([{ respondent_label: '' }, { respondent_label: '' }])).toEqual({
      kind: 'known',
      labels: [],
    });
  });
});
