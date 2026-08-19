import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts } from '../../lib/report/facts';
import { knownLabels } from '../../lib/report/anonymity';
import { IMPROVEMENT_STANDARD, needsWork, strongestAreas, priorityAreas } from '../../lib/report/improvement';

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

// All 12 profile columns are populated (not left null) so that a guard test asserting
// omission — e.g. "every free-text field disappears when the label source is redacted" —
// is proof the guard did the dropping, not a vacuous check against a field that was already
// absent. RESPONSES below labels its respondents 'a' / 'b' / 'c', which is why baseArgs'
// default labelSource (below) is an EMPTY known list rather than one derived from RESPONSES:
// a single-character label is a substring of nearly any word, so deriving from RESPONSES
// would make ordinary prose fields vanish for a reason unrelated to whatever a given test is
// checking. Tests that mean to exercise the guard build their own labelSource — see
// `profileOf` below and the `LabelSource controls the profile guard` describe block.
const CHURCH: ChurchFacts = {
  name: 'Grace Chapel',
  denomination: 'Independent',
  context: 'suburban',
  attendance_band: '250_499',
  adults_band: '310',
  staff_fte_band: '4.5',
  budget_band: '$750k',
  church_age_band: '42 years',
  growth_trajectory: 'plateaued',
  campuses_band: '2',
  facility_status: 'owned',
  leadership_history: 'Senior pastor since 2014; associate pastor hired in 2021.',
  consultant_notes: 'No major changes since the last assessment.',
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

const baseArgs: BuildFactsArgs = {
  diagnosis: makeDiagnosis(),
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  // Empty on purpose — see the comment above CHURCH.
  labelSource: { kind: 'known', labels: [] },
};

const facts = buildFacts(baseArgs);

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
      tier: { id: 'strained', name: 'Growth Constrained' },
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
    // CHURCH has all 12 columns populated (see the comment above it), so nulling two here —
    // one free-text, one closed-vocab — is what actually exercises "omit gracefully" rather
    // than trivially observing fields that were never set.
    const pack = buildFacts({
      ...baseArgs,
      church: { ...baseArgs.church, adults_band: null, context: null },
    });
    expect(pack.profile.adults_band).toBeUndefined();
    expect(pack.profile.context).toBeUndefined();
    expect(pack.profile.denomination).toBe('Independent');
    expect(pack.profile.attendance_band).toBe('250_499');
    expect(pack.profile.growth_trajectory).toBe('plateaued');
    expect(pack.profile.facility_status).toBe('owned');
    expect(pack.profile.name).toBeUndefined(); // name lives on cover, never in profile
  });
});

describe('buildFacts — gating + themes defaults', () => {
  it('foundation-shaped diagnosis surfaces gating with enabler names and scores', () => {
    const f = buildFacts({
      ...baseArgs,
      diagnosis: makeDiagnosis({
        primary_constraint: null,
        gating_conditions: [{ enabler_id: 'gov', note: 'Governance gates all stages' }],
      }),
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
      ...baseArgs,
      responses,
      church: { ...CHURCH, ...church },
      completedAt: null,
      labelSource: knownLabels(responses),
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

const FREE_TEXT_KEYS = [
  'denomination', 'adults_band', 'staff_fte_band', 'budget_band',
  'church_age_band', 'campuses_band', 'leadership_history', 'consultant_notes',
] as const;
const CLOSED_VOCAB_KEYS = ['context', 'attendance_band', 'growth_trajectory', 'facility_status'] as const;

describe('LabelSource controls the profile guard', () => {
  it('omits every free-text profile field and keeps the four closed-vocabulary ones when redacted', () => {
    const pack = buildFacts({ ...baseArgs, labelSource: { kind: 'redacted' } });
    for (const k of FREE_TEXT_KEYS) expect(pack.profile[k]).toBeUndefined();
    for (const k of CLOSED_VOCAB_KEYS) expect(pack.profile[k]).toBeDefined();
  });

  it('keeps the closed-vocabulary fields when a respondent label collides with an option value', () => {
    // Today a respondent named 'Li' silently costs growth_trajectory: 'declining'.
    const pack = buildFacts({
      ...baseArgs,
      church: { ...baseArgs.church, growth_trajectory: 'declining', facility_status: 'owned' },
      labelSource: { kind: 'known', labels: ['Li', 'Ow'] },
    });
    expect(pack.profile.growth_trajectory).toBe('declining');
    expect(pack.profile.facility_status).toBe('owned');
  });

  it('still drops a free-text field that contains a respondent label', () => {
    const pack = buildFacts({
      ...baseArgs,
      church: { ...baseArgs.church, consultant_notes: 'Priscilla Vandermeer raised this in April.' },
      labelSource: { kind: 'known', labels: ['Priscilla Vandermeer'] },
    });
    expect(pack.profile.consultant_notes).toBeUndefined();
  });
});

describe('improvement facts (the 80 standard)', () => {
  it('carries the standard itself so no renderer re-types 80', () => {
    const facts = buildFacts(baseArgs);
    expect(facts.improvement.standard).toBe(IMPROVEMENT_STANDARD);
  });

  it('ranks every sub-standard area worst-first with its gap to the standard', () => {
    const facts = buildFacts(baseArgs);
    // makeDiagnosis scores: guest 72, conn 44, disc 61, vol 58, gen 66, gov 70, comm 55, sys 68.
    expect(facts.improvement.areas_needing_work.map((a) => a.category_id)).toEqual([
      'conn', 'comm', 'vol', 'disc', 'gen', 'sys', 'gov', 'guest',
    ]);
    const worst = facts.improvement.areas_needing_work[0]!;
    expect(worst.score).toBe(44);
    expect(worst.gap_to_standard).toBe(36);
    expect(worst.name).toBe('Community / Connection');
    expect(worst.kind).toBe('stage');
  });

  it('drops an area that clears the standard', () => {
    const strong = makeDiagnosis({
      categories: CAT_IDS.map((id, i) => makeCategory(id, [88, 44, 61, 58, 66, 70, 55, 68][i]!)),
    });
    const facts = buildFacts({ ...baseArgs, diagnosis: strong });
    expect(facts.improvement.areas_needing_work.map((a) => a.category_id)).not.toContain('guest');
    expect(facts.improvement.areas_needing_work).toHaveLength(7);
  });

  it('gives each area its OWN weak questions, not the report-wide six', () => {
    const facts = buildFacts(baseArgs);
    const byId = new Map(facts.improvement.areas_needing_work.map((a) => [a.category_id, a]));
    expect(byId.get('guest')!.weak_items.map((w) => w.item_id)).toEqual(['G1', 'G2']);
    expect(byId.get('conn')!.weak_items.map((w) => w.item_id)).toEqual(['C1']);
  });

  it('draws weak questions from every item, not from the six-item bottom list', () => {
    // A 7th sub-standard item pushes SYS1 out of bottom_items (capped at 6) while leaving it
    // well below the standard. Reading bottom_items would starve `sys` of its evidence.
    const responses: Response[] = [...RESPONSES, resp('SYS1', 'sys', 7, 'a')];
    const facts = buildFacts({ ...baseArgs, responses });
    expect(facts.bottom_items.map((b) => b.item_id)).not.toContain('SYS1');
    const sys = facts.improvement.areas_needing_work.find((a) => a.category_id === 'sys')!;
    expect(sys.weak_items.map((w) => w.item_id)).toEqual(['SYS1']);
    expect(sys.weak_items[0]!.mean).toBe(70);
  });

  it('leaves out a question that clears the standard', () => {
    const facts = buildFacts(baseArgs);
    const vol = facts.improvement.areas_needing_work.find((a) => a.category_id === 'vol')!;
    // V2 means 85 — above the standard — while V1 means 50.
    expect(vol.weak_items.map((w) => w.item_id)).toEqual(['V1']);
  });

  it('sorts weak questions worst-first, ties by item id', () => {
    const facts = buildFacts(baseArgs);
    const guest = facts.improvement.areas_needing_work.find((a) => a.category_id === 'guest')!;
    expect(guest.weak_items.map((w) => w.mean)).toEqual([25, 30]);
  });

  it('carries each weak question’s statement and theme so a section never re-looks them up', () => {
    const facts = buildFacts(baseArgs);
    const conn = facts.improvement.areas_needing_work.find((a) => a.category_id === 'conn')!;
    expect(conn.weak_items[0]!.text.length).toBeGreaterThan(0);
    expect(['systems', 'culture', 'theology', 'relational']).toContain(conn.weak_items[0]!.theme);
  });

  it('lists an unanswered area with no weak questions rather than dropping it', () => {
    const facts = buildFacts(baseArgs);
    const gov = facts.improvement.areas_needing_work.find((a) => a.category_id === 'gov')!;
    expect(gov.weak_items).toEqual([]);
  });

  it('names the three strongest areas even when none clear the standard', () => {
    const facts = buildFacts(baseArgs);
    expect(facts.improvement.strongest_areas.map((a) => a.category_id)).toEqual(['guest', 'gov', 'sys']);
    expect(facts.improvement.strongest_areas[0]!.name).toBe('Guest Experience');
    expect(facts.improvement.strongest_areas[0]!.score).toBe(72);
  });

  it('names the three priority areas, worst first', () => {
    const facts = buildFacts(baseArgs);
    expect(facts.improvement.priority_areas.map((a) => a.category_id)).toEqual(['conn', 'comm', 'vol']);
  });

  it('agrees with the improvement module rather than re-implementing the ranking', () => {
    const facts = buildFacts(baseArgs);
    expect(facts.improvement.areas_needing_work.map((a) => a.category_id))
      .toEqual(needsWork(facts.categories).map((c) => c.id));
    expect(facts.improvement.strongest_areas.map((a) => a.category_id))
      .toEqual(strongestAreas(facts.categories).map((c) => c.id));
    expect(facts.improvement.priority_areas.map((a) => a.category_id))
      .toEqual(priorityAreas(facts.categories).map((c) => c.id));
  });

  it('stays JSON-serializable, like the rest of the pack', () => {
    const facts = buildFacts(baseArgs);
    expect(JSON.parse(JSON.stringify(facts.improvement))).toEqual(facts.improvement);
  });
});
