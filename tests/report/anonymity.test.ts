import { describe, expect, it } from 'vitest';
import { containsRespondentLabel, knownLabels, respondentLabels } from '@/lib/report/anonymity';
import { MIN_SUPPORT } from '@/lib/ai/theme-gates';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { loadMethodology } from '@/lib/methodology/load';
import { makeFacts, THEMES_N3_FACTS } from '../fixtures/facts';

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

describe('s8 verbatim gating (k on themes and the share page; audience on the verbatims)', () => {
  const methodology = loadMethodology();
  // CONCERN (deviates from the brief's literal Step 1 code — see task-10-report.md): the brief
  // used item_id 'G1', but 'G1' (category guest) carries no `reflection:` field in production
  // questions.yaml, so buildOutreachVoices would NEVER surface it regardless of respondent
  // count — this test could not pass as written. 'G6' is the real reflection-prompted item
  // (category guest) tests/report/fallback-sections.test.ts:77-80 already established for the
  // identical reason ("the brief's `reflectionItemId` is not itself a defined fixture").
  const REFLECTIONS = [
    { item_id: 'G6', reflection: 'I greeted the guest and walked them to the coffee table.' },
    { item_id: 'G6', reflection: 'Nobody followed up with the family who visited in June.' },
  ];
  // `audience: 'pdf'` since step E — this suite is about the k-threshold and the label guard on
  // a PRIVATE surface. Without it the audience gate would suppress these bullets first and the
  // suppression test below would pass for the wrong reason.
  const s8 = (facts: ReturnType<typeof makeFacts>, reflections = REFLECTIONS) =>
    fallbackSection('s8', { facts, methodology, reflections, audience: 'pdf' }).bullets;

  /**
   * REVERSED 2026-08-19 (Natalie, on a live 2-respondent report): the PRIVATE report shows the
   * responses whatever the respondent count — "just not show the names". The k-threshold's home
   * is the theme clusterer and the share page, where a link anyone can forward makes a low-n
   * verbatim attributable; the private report is the leadership team reading its own words.
   */
  it('shows verbatim reflections on the private report even below the old threshold', () => {
    const tooFew = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: MIN_SUPPORT - 1 } });
    const bullets = s8(tooFew);
    for (const r of REFLECTIONS) expect(bullets.join(' ')).toContain(r.reflection);
  });

  it('still withholds every verbatim from the share page, at any respondent count', () => {
    for (const count of [1, MIN_SUPPORT, 9]) {
      const facts = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: count } });
      const bullets = fallbackSection('s8', { facts, methodology, reflections: REFLECTIONS, audience: 'shared' }).bullets;
      for (const r of REFLECTIONS) expect(bullets.join(' '), String(count)).not.toContain(r.reflection);
      expect(bullets, String(count)).toEqual([methodology.copy.s8_below_threshold]);
    }
  });

  it('still prints reflections at or above the threshold', () => {
    const enough = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: MIN_SUPPORT } });
    const bullets = s8(enough).join(' ');
    for (const r of REFLECTIONS) expect(bullets).toContain(r.reflection);
  });

  it('never suppresses the THEME path — it already enforces k>=3 itself', () => {
    const bullets = s8(THEMES_N3_FACTS);
    expect(bullets.join(' ')).toContain(THEMES_N3_FACTS.themes[0]!.label);
    expect(bullets).not.toEqual([methodology.copy.s8_below_threshold]);
  });

  it('says nothing was written, not an empty section, when there are no reflections at all', () => {
    // "Not shown to protect respondent anonymity" would be untrue here — nothing exists to
    // protect. The private report states what actually happened.
    const enough = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: 9 } });
    expect(s8(enough, [])).toEqual([methodology.copy.s8_no_reflections]);
  });
});
