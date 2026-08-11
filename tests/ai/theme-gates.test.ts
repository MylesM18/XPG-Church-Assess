import { describe, expect, it } from 'vitest';
import {
  gateTheme,
  gateThemes,
  methodologyItemIds,
  MAX_VERBATIM_CHARS,
  type GateContext,
} from '../../lib/ai/theme-gates';
import type { ParsedTheme } from '../../lib/ai/themes';

const theme = (over: Partial<ParsedTheme> = {}): ParsedTheme => ({
  label: 'Communication gaps',
  gloss: 'People say decisions are not explained.',
  support_indices: ['r1', 'r2', 'r3'],
  item_ids: ['i1'],
  verbatim_candidates: null,
  ...over,
});

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  owners: new Map([
    ['r1', 'p1'],
    ['r2', 'p2'],
    ['r3', 'p3'],
    ['r4', 'p1'],
  ]),
  sourceTexts: ['we never hear why decisions get made', 'nobody explains the plan'],
  labels: ['Priscilla Vandermeer'],
  validItemIds: new Set(['i1', 'i2']),
  writerCount: 10,
  ...over,
});

describe('gateTheme — support (k>=3, server-computed)', () => {
  it('accepts a theme with 3 distinct supporting respondents', () => {
    const out = gateTheme(theme(), ctx());
    expect(out).not.toBeNull();
    expect(out!.support_count).toBe(3);
  });

  it('drops a theme with only 2 distinct supporters', () => {
    expect(gateTheme(theme({ support_indices: ['r1', 'r2'] }), ctx())).toBeNull();
  });

  it('counts distinct respondents, not indices', () => {
    // r1 and r4 are the same person (p1). Three indices, two people — must drop.
    expect(gateTheme(theme({ support_indices: ['r1', 'r4', 'r2'] }), ctx())).toBeNull();
  });

  it('ignores an index the model invented', () => {
    // 'r99' has no owner, so it contributes nothing. Never trust the model's indices.
    expect(gateTheme(theme({ support_indices: ['r1', 'r2', 'r99'] }), ctx())).toBeNull();
  });
});

describe('gateTheme — item ids', () => {
  it('drops a theme naming an item outside the effective methodology', () => {
    expect(gateTheme(theme({ item_ids: ['i1', 'nope'] }), ctx())).toBeNull();
  });

  it('drops a theme with no item ids at all', () => {
    // Vacuously "all ids valid", but S8 groups themes by the item that prompted them, so an
    // unattributable theme has nowhere to render. Drop rather than ship an orphan.
    expect(gateTheme(theme({ item_ids: [] }), ctx())).toBeNull();
  });
});

describe('gateTheme — respondent-label ban', () => {
  it('drops a theme whose label names a respondent', () => {
    expect(gateTheme(theme({ label: 'Priscilla Vandermeer is frustrated' }), ctx())).toBeNull();
  });

  it('drops a theme whose gloss names a respondent', () => {
    expect(gateTheme(theme({ gloss: 'As Priscilla Vandermeer put it, nobody knows.' }), ctx())).toBeNull();
  });

  it('matches labels of ALL run respondents, not only flagged ones', () => {
    // Wider than lib/ai/prose.ts's check 5, which scopes to disagreement_flags. Deliberate:
    // spec line 71. The list handed in here is every respondent in the run.
    expect(
      gateTheme(theme({ label: 'Dana Okafor speaks up' }), ctx({ labels: ['Dana Okafor'] })),
    ).toBeNull();
  });
});

describe('gateTheme — verbatims', () => {
  const withCandidate = theme({ verbatim_candidates: ['nobody explains the plan'] });

  it('keeps an exact substring of a source reflection at n>=8', () => {
    expect(gateTheme(withCandidate, ctx())!.verbatims).toEqual(['nobody explains the plan']);
  });

  it('emits no verbatims below the n>=8 writer pool but keeps the theme', () => {
    const out = gateTheme(withCandidate, ctx({ writerCount: 7 }));
    expect(out).not.toBeNull();
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a candidate that is not a substring of any source text', () => {
    const out = gateTheme(theme({ verbatim_candidates: ['nobody explains the strategy'] }), ctx());
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a candidate over the length ceiling', () => {
    const long = 'x'.repeat(MAX_VERBATIM_CHARS + 1);
    const out = gateTheme(theme({ verbatim_candidates: [long] }), ctx({ sourceTexts: [long] }));
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a labelled candidate but keeps the theme and its clean candidates', () => {
    const out = gateTheme(
      theme({ verbatim_candidates: ['Priscilla Vandermeer said no', 'nobody explains the plan'] }),
      ctx({ sourceTexts: ['Priscilla Vandermeer said no', 'nobody explains the plan'] }),
    );
    expect(out!.verbatims).toEqual(['nobody explains the plan']);
  });

  it('treats a null candidate list as no verbatims', () => {
    expect(gateTheme(theme(), ctx())!.verbatims).toEqual([]);
  });
});

describe('gateThemes', () => {
  it('drops failing themes individually and keeps the rest', () => {
    const out = gateThemes(
      { themes: [theme(), theme({ label: 'thin', support_indices: ['r1'] })], affection_theme: null },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps']);
  });

  it('appends a passing affection theme last', () => {
    const out = gateThemes(
      { themes: [theme()], affection_theme: theme({ label: 'They love the people here' }) },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps', 'They love the people here']);
  });

  it('drops a failing affection theme without touching the others', () => {
    const out = gateThemes(
      { themes: [theme()], affection_theme: theme({ label: 'thin', support_indices: ['r1'] }) },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps']);
  });

  it('returns an empty array when every theme fails', () => {
    expect(gateThemes({ themes: [theme({ support_indices: [] })], affection_theme: null }, ctx())).toEqual([]);
  });
});

describe('methodologyItemIds', () => {
  it('collects item ids across every category', () => {
    const methodology = {
      questions: {
        categories: [
          { id: 'c1', items: [{ id: 'i1' }, { id: 'i2' }] },
          { id: 'c2', items: [{ id: 'i3' }] },
        ],
      },
    };
    expect([...methodologyItemIds(methodology as never)].sort()).toEqual(['i1', 'i2', 'i3']);
  });
});
