import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type ChurchFacts } from '../../lib/report/facts';

const methodology = loadMethodology();
const CAT_IDS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'] as const;

function makeCategory(id: string, score: number, over: Partial<DiagnosisCategory> = {}): DiagnosisCategory {
  return {
    category_id: id,
    kind: (['gov', 'comm', 'sys'].includes(id) ? 'enabler' : 'stage') as DiagnosisCategory['kind'],
    score,
    belief: null,
    evidence: null,
    gap: null,
    gap_class: null,
    cohort_percentile: 40,
    state: 'ok',
    respondent_count: 3,
    excluded_partial: 0,
    questionEffects: [],
    ...over,
  };
}

// One real authored dependency edge, with scores attached the way the engine does —
// its `read` key is guaranteed to exist in copy.yaml's dependency_reads.
//
// FIXTURE FIX (per task-4-brief.md's Note / controller's ambiguity note): the parsed
// `methodology.rules.dependencies[0]` shape is `Dependency` (lib/methodology/schema.ts's
// DependencySchema) which carries only `from`/`to`/`kind`/`statement` — it has NO `read`
// key. `read` only exists on the engine's `DependencyEdge` (lib/engine/dependencies.ts),
// computed at diagnosis time by `readEdge()`. Spreading `realDep` alone therefore leaves
// `depEdge.read` as `undefined`, and `facts.ts`'s `methodology.copy.dependency_reads[e.read]`
// would resolve to `undefined`, crashing `interp()` before it can even leave a `{token}`
// behind. Per the brief's explicit instruction, the fix is to supply `read` explicitly in
// the fixture rather than weaken the "no {token} left" assertion below.
const realDep = methodology.rules.dependencies[0]! as unknown as Record<string, unknown>;
const depEdge = {
  ...realDep,
  read: 'load_bearing',
  fromScore: 48,
  toScore: 62,
} as Diagnosis['dependencies'][number];

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 52.4,
    capacity: 63.9,
    gap: 11.5,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 44, 61, 58, 66, 70, 55, 68][i]!)),
    primary_constraint: { category_id: 'conn' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'breadth',
    blind_spots: [{ category_id: 'vol', belief: 71, evidence: 49, gap: 22 }],
    disagreement_flags: [{ category_id: 'disc', spread: 2.4 } as Diagnosis['disagreement_flags'][number]],
    calibration: { spread: 1.1 } as Diagnosis['calibration'],
    dependencies: [depEdge],
    correlations: [],
    offer: { call_type: 'call', hook: 'h' } as Diagnosis['offer'],
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  };
}

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who };
}

// denomination + growth_trajectory deliberately avoid the letters a/b/c: RESPONSES below
// labels its respondents 'a' / 'b' / 'c', and Task 3's profile anonymity guard treats any
// of those as a substring match. 'Non-denominational' and 'plateaued' both contain 'a', so
// once the guard is live it drops them from every profile fixture in this file for a reason
// unrelated to what this describe block is testing (null-field omission). RESPONSES itself
// can't change here — the new anonymity-guard tests below key their NAMES map off the exact
// strings 'a'/'b'/'c'.
const CHURCH: ChurchFacts = {
  name: 'Grace Chapel',
  denomination: 'Independent',
  context: null,
  attendance_band: '250_499',
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: 'holding',
  campuses_band: null,
  facility_status: 'owned',
  leadership_history: null,
  consultant_notes: null,
};

// G1 mean 2.5 → 25; G2 mean 3 → 30; C1 mean 3 → 30 (ties with G2, C1 < G2 lexicographically);
// D1/V1/GEN1 fill out the six; V2 (mean 8.5 → 85) must be excluded from bottom_items.
const RESPONSES: Response[] = [
  resp('G1', 'guest', 2, 'a'), resp('G1', 'guest', 3, 'b'),
  resp('G2', 'guest', 3, 'a'),
  resp('C1', 'conn', 3, 'b'),
  resp('D1', 'disc', 4, 'a'),
  resp('V1', 'vol', 5, 'b'),
  resp('GEN1', 'gen', 6, 'c'),
  resp('V2', 'vol', 8, 'c'), resp('V2', 'vol', 9, 'a'),
];

const facts = buildFacts({
  diagnosis: makeDiagnosis(),
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
});

describe('buildFacts — cover + overall', () => {
  it('counts DISTINCT respondents and carries church name + completion time', () => {
    expect(facts.cover).toEqual({
      church_name: 'Grace Chapel',
      completed_at: '2026-08-10T00:00:00Z',
      respondent_count: 3,
    });
  });
  it('overall carries capacity, throughput, gap and the derived tier', () => {
    expect(facts.overall).toEqual({
      capacity: 63.9,
      throughput: 52.4,
      gap: 11.5,
      tier: { id: 'strained', name: 'Strained' },
    });
  });
  it('archetype comes from the engine verdict', () => {
    expect(facts.archetype).toBe('constraint');
    expect(facts.primary_constraint).toEqual({
      category_id: 'conn',
      name: methodology.questions.categories.find((c) => c.id === 'conn')!.name,
    });
  });
});

describe('buildFacts — categories', () => {
  it('sorts descending by score, ties broken by id ascending', () => {
    const scores = facts.categories.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(facts.categories[0]!.id).toBe('guest'); // 72 is the top fixture score
    expect(facts.categories).toHaveLength(8);
  });
  it('carries name, kind, state, percentile and respondent_count per category', () => {
    const guest = facts.categories.find((c) => c.id === 'guest')!;
    expect(guest.kind).toBe('stage');
    expect(guest.percentile).toBe(40);
    expect(guest.respondent_count).toBe(3);
    expect(facts.categories.find((c) => c.id === 'sys')!.kind).toBe('enabler');
  });
});

describe('buildFacts — bottom items (spec S7 table source)', () => {
  it('ranks by mean ascending ×10, ties broken by item id, and caps at 6', () => {
    expect(facts.bottom_items).toHaveLength(6);
    expect(facts.bottom_items.map((b) => b.item_id)).toEqual(['G1', 'C1', 'G2', 'D1', 'V1', 'GEN1']);
    expect(facts.bottom_items[0]!.mean).toBe(25); // (2+3)/2 × 10
    expect(facts.bottom_items.map((b) => b.item_id)).not.toContain('V2');
  });
  it('each bottom item carries its statement text and theme from the effective methodology', () => {
    const g1 = facts.bottom_items[0]!;
    const g1Item = methodology.questions.categories
      .flatMap((c) => c.items)
      .find((i) => i.id === 'G1')!;
    expect(g1.text).toBe(g1Item.text);
    expect(g1.theme).toBe(g1Item.theme);
    expect(g1.category_id).toBe('guest');
  });
  it('pattern_counts always carries all four themes and sums to the bottom-item count', () => {
    expect(Object.keys(facts.pattern_counts).sort()).toEqual(['culture', 'relational', 'systems', 'theology']);
    const total = Object.values(facts.pattern_counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(facts.bottom_items.length);
  });
});

describe('buildFacts — dossier absorptions', () => {
  it('blind spots carry the display name alongside the numbers', () => {
    expect(facts.blind_spots).toEqual([
      {
        category_id: 'vol',
        name: methodology.questions.categories.find((c) => c.id === 'vol')!.name,
        belief: 71,
        evidence: 49,
        gap: 22,
      },
    ]);
  });
  it('dispersion flags carry name + spread', () => {
    expect(facts.dispersion).toEqual([
      { category_id: 'disc', name: methodology.questions.categories.find((c) => c.id === 'disc')!.name, spread: 2.4 },
    ]);
  });
  it('dependency reads are pre-interpolated sentences (no {token} left)', () => {
    expect(facts.dependencies).toHaveLength(1);
    const d = facts.dependencies[0]!;
    expect(d.from_score).toBe(48);
    expect(d.to_score).toBe(62);
    expect(d.read_sentence).not.toMatch(/\{\w+\}/);
    expect(d.read_sentence.length).toBeGreaterThan(0);
  });
  it('generosity mode and confidence pass through', () => {
    expect(facts.generosity_mode).toBe('breadth');
    expect(facts.confidence).toBe(0.85);
  });
});

describe('buildFacts — profile subset (locked decision 6: omit gracefully)', () => {
  it('keeps only non-null fields, name excluded (it lives on cover)', () => {
    expect(facts.profile).toEqual({
      denomination: 'Independent',
      attendance_band: '250_499',
      growth_trajectory: 'holding',
      facility_status: 'owned',
    });
  });
});

describe('buildFacts — gating + themes defaults', () => {
  it('foundation-shaped diagnosis surfaces gating with enabler names and scores', () => {
    const f = buildFacts({
      diagnosis: makeDiagnosis({
        primary_constraint: null,
        gating_conditions: [{ enabler_id: 'gov', note: 'Governance gates all stages' }],
      }),
      methodology,
      responses: RESPONSES,
      church: CHURCH,
      completedAt: null,
    });
    expect(f.archetype).toBe('foundation');
    expect(f.gating).toEqual([
      {
        enabler_id: 'gov',
        name: methodology.questions.categories.find((c) => c.id === 'gov')!.name,
        score: 70,
        note: 'Governance gates all stages',
      },
    ]);
    expect(f.cover.completed_at).toBeNull();
  });
  it('themes default to empty until plan 2 supplies clusters', () => {
    expect(facts.themes).toEqual([]);
  });
  it('the pack is JSON-serializable (persisted as facts jsonb in plan 3)', () => {
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });
  it('no respondent identifier appears anywhere in the pack', () => {
    const json = JSON.stringify(facts);
    expect(json).not.toMatch(/respondent_label|respondent_id/);
    // The fixture labels are 'a'/'b'/'c' — none may survive as a JSON string value.
    for (const who of ['"a"', '"b"', '"c"']) expect(json).not.toContain(who);
  });
});

describe('buildFacts — profile anonymity guard', () => {
  // RESPONSES labels its respondents 'a' / 'b' / 'c'. A one-character label is a substring of
  // almost any prose, so reusing it here would drop every profile field and the tests would
  // pass for the wrong reason. Re-label with realistic names so these cases exercise the
  // guard rather than the fixture. (The general point — that very short display labels
  // over-match — is documented scope on the primitive, not a bug in it.)
  const NAMES: Record<string, string> = { a: 'Priscilla Vandermeer', b: 'Dana Okafor', c: 'Marcus Reyes' };
  const NAMED: Response[] = RESPONSES.map((r) => ({
    ...r,
    respondent_label: NAMES[r.respondent_label] ?? r.respondent_label,
  }));
  const UNLABELLED: Response[] = RESPONSES.map((r) => ({ ...r, respondent_label: '' }));

  const profileOf = (church: Partial<ChurchFacts>, responses: Response[] = NAMED) =>
    buildFacts({
      diagnosis: makeDiagnosis(),
      methodology,
      responses,
      church: { ...CHURCH, ...church },
      completedAt: null,
    }).profile;

  it('keeps a profile field that names nobody', () => {
    expect(profileOf({ consultant_notes: 'Two campuses merged last year.' }).consultant_notes)
      .toBe('Two campuses merged last year.');
  });

  it('omits a profile field that reproduces a respondent name', () => {
    // The back door the guard closes: churches.consultant_notes is admin free text copied
    // verbatim into FactsPack.profile, and plan 3's composer will put the pack in a model
    // prompt. Drop the field, not the report.
    expect(profileOf({ consultant_notes: 'Priscilla Vandermeer coordinated the responses.' }).consultant_notes)
      .toBeUndefined();
  });

  it('omits only the offending field, not the whole profile', () => {
    const profile = profileOf({
      leadership_history: 'Priscilla Vandermeer became lead pastor in 2019.',
      consultant_notes: 'Budget is flat year over year.',
    });
    expect(profile.leadership_history).toBeUndefined();
    expect(profile.consultant_notes).toBe('Budget is flat year over year.');
  });

  it('matches case-insensitively', () => {
    expect(profileOf({ consultant_notes: 'notes from PRISCILLA VANDERMEER' }).consultant_notes)
      .toBeUndefined();
  });

  it('keeps every field when no respondent has a usable label', () => {
    // The blank-label trap, at the integration level: a run whose labels are all empty must
    // not cause every profile field to vanish.
    expect(
      profileOf({ consultant_notes: 'Two campuses merged last year.' }, UNLABELLED).consultant_notes,
    ).toBe('Two campuses merged last year.');
  });
});
