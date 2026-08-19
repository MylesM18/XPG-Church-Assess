import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '@/lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '@/lib/report/facts';
import { fallbackSection, fallbackSections } from '@/lib/report/fallback-sections';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

// No healthy-church/broken-conn/gates-only fixtures exist anywhere in the repo (recon
// divergence #1 / controller ruling 1) — built inline here, following the local/unexported
// makeCategory/makeDiagnosis/CHURCH/RESPONSES pattern in tests/report/facts.test.ts:10-121.

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

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 60,
    capacity: 70,
    gap: 10,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 68, 66, 61, 58, 70, 55, 64][i]!)),
    primary_constraint: null,
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'both',
    blind_spots: [],
    disagreement_flags: [],
    calibration: { people: [], spread: 1.1 },
    dependencies: [],
    correlations: [],
    offer: { type: 'x', call_type: 'call', hook: 'h' },
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  };
}

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
  leadership_history: 'Senior pastor since 2014.',
  consultant_notes: 'No major changes since the last assessment.',
};

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who };
}

// A real reflection-prompted item — methodology/questions.yaml's G6 (category guest) — for the
// S8 "falls back to voices" test (recon E5; the brief's `reflectionItemId` is not itself a
// defined fixture).
const reflectionItemId = 'G6';

const RESPONSES: Response[] = [
  resp('G1', 'guest', 7, 'a'),
  resp('G1', 'guest', 8, 'b'),
  resp('C1', 'conn', 7, 'a'),
  resp('D1', 'disc', 6, 'b'),
  resp('V1', 'vol', 6, 'c'),
  resp('GEN1', 'gen', 6, 'a'),
];

const baseArgs: Omit<BuildFactsArgs, 'diagnosis'> = {
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  labelSource: { kind: 'known', labels: [] },
};

// capacity archetype (archetypeFor: no primary_constraint, no gating_conditions). Uses a null
// generosity_mode on purpose — Natalie's ruling 6 says both S10's capacity path and S11 must
// fall back to 'both' rather than throw or drop the bullet.
const capacityFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
});

// constraint archetype: primary = conn, one real downstream sequence dependency (conn -> disc)
// so S10's "do not work on yet" bullet has a genuine name to list.
const connDep = methodology.rules.dependencies.find((d) => d.from === 'conn' && d.to === 'disc')!;
const constraintFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 30, 66, 61, 58, 70, 55, 64][i]!, { state: id === 'conn' ? 'broken' : 'ok' }),
    ),
    primary_constraint: { category_id: 'conn' },
    dependencies: [{ ...connDep, read: 'load_bearing', fromScore: 30, toScore: 66 }],
  }),
});

// constraint archetype where the primary IS gen — offers.stages has no 'gen' key (Natalie's
// ruling 4), so S11 must route to offers.generosity instead. generosity_mode is null here too,
// to prove the same fallback applies on this path (ruling 6).
const genConstraintFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 68, 66, 61, 20, 70, 55, 64][i]!, { state: id === 'gen' ? 'broken' : 'ok' }),
    ),
    primary_constraint: { category_id: 'gen' },
    generosity_mode: null,
  }),
});

// constraint archetype whose primary is an enabler-shaped id (gov) that ALSO exists under
// action_library.enablers with DIFFERENT text (ruling 7's trap) — proves the constraint path
// reads action_library.categories.gov, not action_library.enablers.gov. Top-level (not
// inline in the ruling-7 test) so the generic archetype-property suite below can cover it too
// (fix round 1, item C).
const govConstraintFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 68, 66, 61, 58, 20, 55, 64][i]!, { state: id === 'gov' ? 'broken' : 'ok' }),
    ),
    primary_constraint: { category_id: 'gov' },
  }),
});

// foundation archetype: TWO gated enablers (comm, sys) — Natalie's ruling 8: 2 gated enablers
// must yield 6 S10 bullets (3 phases x 2 enablers), not 3.
const foundationFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    primary_constraint: null,
    gating_conditions: [
      { enabler_id: 'comm', note: 'Comm gates guest and conn.' },
      { enabler_id: 'sys', note: 'Sys gates vol and disc.' },
    ],
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 68, 66, 61, 58, 70, 30, 30][i]!, {
        state: id === 'comm' || id === 'sys' ? 'gate' : 'ok',
      }),
    ),
  }),
});

const IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'] as const;

// 3-tuple [label, archetypeKey, facts]: archetypeKey indexes banned_phrases/report templates
// (only 'capacity'|'constraint'|'foundation' exist there), while label disambiguates the two
// extra constraint-archetype fixtures (gen-primary, gov-primary) added for fix-round-1 item C —
// both are archetype 'constraint' but exercise different lookups (ruling 4's gen fallthrough,
// ruling 7's categories-vs-enablers trap) and deserve the same blanket property coverage as the
// three base archetypes.
describe.each([
  ['capacity', 'capacity', capacityFacts],
  ['constraint', 'constraint', constraintFacts],
  ['foundation', 'foundation', foundationFacts],
  ['gen-primary constraint', 'constraint', genConstraintFacts],
  ['gov-primary constraint', 'constraint', govConstraintFacts],
] as const)('%s (%s archetype)', (_label, archetypeKey, facts) => {
  const all = fallbackSections({ facts, methodology, reflections: [] });

  it('produces every section with a non-empty title and body', () => {
    expect(Object.keys(all).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      expect(all[id].title.length, id).toBeGreaterThan(0);
      expect(all[id].body.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('leaves no uninterpolated tokens anywhere', () => {
    for (const id of IDS) {
      expect(all[id].body, id).not.toMatch(/\{[a-z_]+\}/);
      for (const b of all[id].bullets) expect(b, id).not.toMatch(/\{[a-z_]+\}/);
    }
  });

  it('uses no other archetype banned phrase', () => {
    const text = IDS.map((id) => `${all[id].body} ${all[id].bullets.join(' ')}`).join(' ').toLowerCase();
    for (const phrase of methodology.report.banned_phrases[archetypeKey]) {
      expect(text, phrase).not.toContain(phrase.toLowerCase());
    }
  });
});

describe('S2 profile bullets', () => {
  it('omits gracefully when the profile is empty', () => {
    const facts = { ...capacityFacts, profile: {} };
    expect(fallbackSection('s2', { facts, methodology, reflections: [] }).bullets).toEqual([]);
  });

  it('lists each populated profile field', () => {
    const facts = { ...capacityFacts, profile: { context: 'suburban' } };
    expect(fallbackSection('s2', { facts, methodology, reflections: [] }).bullets).toHaveLength(1);
  });
});

// Task 7: S3 dropped from eight `Name: score — bandRead` bullets (one per category, now
// redundant beside the statGridModel chart wired in Task 6) to a single XPG-read line keyed off
// archetype x tier. The two tests below replace the old eight-bullet assertions; the fuller
// archetype x tier coverage lives in the 's3 executive dashboard' describe block below.
describe('S1 respondent phrase', () => {
  it('pluralises to "N respondents" and drops the timestamp', () => {
    const facts = { ...capacityFacts, cover: { ...capacityFacts.cover, respondent_count: 4 } };
    const s1 = fallbackSection('s1', { facts, methodology, reflections: [] });
    expect(s1.body).toBe(`${facts.cover.church_name}. 4 respondents.`);
  });

  it('singularises to "1 respondent" when the count is exactly one', () => {
    const facts = { ...capacityFacts, cover: { ...capacityFacts.cover, respondent_count: 1 } };
    const s1 = fallbackSection('s1', { facts, methodology, reflections: [] });
    expect(s1.body).toBe(`${facts.cover.church_name}. 1 respondent.`);
  });
});

describe('S3 health dashboard', () => {
  it('renders exactly one bullet — the XPG read for this archetype and tier', () => {
    const s3 = fallbackSection('s3', { facts: capacityFacts, methodology, reflections: [] });
    expect(s3.bullets).toHaveLength(1);
    expect(s3.bullets[0]).toBe(
      methodology.copy.xpg_read[capacityFacts.archetype][capacityFacts.overall.tier.id],
    );
  });

  it('reads the constraint-archetype line for a constraint fixture and the foundation-archetype line for a foundation fixture', () => {
    const s3c = fallbackSection('s3', { facts: constraintFacts, methodology, reflections: [] });
    expect(constraintFacts.archetype).toBe('constraint');
    expect(s3c.bullets[0]).toBe(
      methodology.copy.xpg_read.constraint[constraintFacts.overall.tier.id],
    );

    const s3f = fallbackSection('s3', { facts: foundationFacts, methodology, reflections: [] });
    expect(foundationFacts.archetype).toBe('foundation');
    expect(s3f.bullets[0]).toBe(
      methodology.copy.xpg_read.foundation[foundationFacts.overall.tier.id],
    );
  });
});

describe('S8 fallback', () => {
  it('renders clustered themes when present', () => {
    const facts = {
      ...capacityFacts,
      themes: [{ label: 'Follow-up', gloss: 'People are lost after week two.', support_count: 4, item_ids: ['conn_2'], verbatims: [] }],
    };
    const s8 = fallbackSection('s8', { facts, methodology, reflections: [] });
    expect(s8.bullets[0]).toContain('Follow-up');
    expect(s8.bullets[0]).toContain('4');
  });

  it('falls back to the per-area voices lists when there are no themes', () => {
    // Declares a private audience since step E: the voices path is what the audience gate
    // protects, so this test now has to say which surface it is. The behaviour it pins —
    // reflections becoming per-area voice lines — is unchanged on that surface. The
    // withheld-on-shared half lives in 'S8 audience gate (step E)' below.
    const s8 = fallbackSection('s8', {
      facts: { ...capacityFacts, themes: [] },
      methodology,
      reflections: [{ item_id: reflectionItemId, reflection: 'greeters are great' }],
      audience: 'screen',
    });
    expect(s8.bullets.some((b) => b.includes('greeters are great'))).toBe(true);
  });

  it('never concatenates a verbatim into a bullet', () => {
    const facts = {
      ...capacityFacts,
      themes: [{ label: 'Follow-up', gloss: 'g', support_count: 4, item_ids: ['conn_2'], verbatims: ['SENTINEL QUOTE'] }],
    };
    const s8 = fallbackSection('s8', { facts, methodology, reflections: [] });
    expect(s8.bullets.join(' ')).not.toContain('SENTINEL QUOTE');
  });
});

/**
 * Step E — Natalie's D2: the verbatim reflections are PRIVATE. They render on the two
 * private surfaces (screen, pdf) and never on the share page.
 *
 * The gate is an ALLOW-list, not the deny-list buildReportView uses (lib/report/view.ts:442),
 * and `audience` is OPTIONAL on FallbackSectionArgs — so a call site that forgets to declare
 * itself WITHHOLDS rather than leaks. That direction is the whole point; the "absent" test
 * below is what pins it.
 */
describe('S8 audience gate (step E)', () => {
  const themeless = { ...CAPACITY_FACTS, themes: [] };
  const reflections = [{ item_id: reflectionItemId, reflection: 'greeters are great' }];
  const withheld = methodology.copy.s8_below_threshold;

  it('renders the verbatim reflections on the screen report', () => {
    const s8 = fallbackSection('s8', { facts: themeless, methodology, reflections, audience: 'screen' });
    expect(s8.bullets.some((b) => b.includes('greeters are great'))).toBe(true);
  });

  it('renders the verbatim reflections on the pdf report', () => {
    const s8 = fallbackSection('s8', { facts: themeless, methodology, reflections, audience: 'pdf' });
    expect(s8.bullets.some((b) => b.includes('greeters are great'))).toBe(true);
  });

  it('withholds the verbatim reflections on the shared report', () => {
    const s8 = fallbackSection('s8', { facts: themeless, methodology, reflections, audience: 'shared' });
    expect(s8.bullets.join(' ')).not.toContain('greeters are great');
    expect(s8.bullets).toEqual([withheld]);
  });

  it('withholds the verbatim reflections when no audience is declared', () => {
    // Fail closed. An allow-list means a forgotten call site loses content; a deny-list would
    // have leaked it. Deleting `audience` from the args must NOT print the reflection.
    const s8 = fallbackSection('s8', { facts: themeless, methodology, reflections });
    expect(s8.bullets.join(' ')).not.toContain('greeters are great');
    expect(s8.bullets).toEqual([withheld]);
  });

  it('still renders the k-gated themes on the shared report', () => {
    // Themes are aggregates that already ship on the share page. Gating them too would be a
    // silent content regression — this is the test that would catch a gate placed at the top
    // of s8Bullets instead of after the themes branch.
    const facts = {
      ...CAPACITY_FACTS,
      themes: [{ label: 'Follow-up', gloss: 'People are lost after week two.', support_count: 4, item_ids: ['conn_2'], verbatims: [] }],
    };
    const s8 = fallbackSection('s8', { facts, methodology, reflections, audience: 'shared' });
    expect(s8.bullets[0]).toContain('Follow-up');
    expect(s8.bullets).not.toEqual([withheld]);
  });

  it('keeps the MIN_SUPPORT threshold on the private report', () => {
    // Orthogonal to audience: Natalie asked to drop names, not the k-threshold. Two respondents
    // is below MIN_SUPPORT (3), so even the screen report withholds.
    const facts = {
      ...themeless,
      cover: { ...CAPACITY_FACTS.cover, respondent_count: 2 },
    };
    const s8 = fallbackSection('s8', { facts, methodology, reflections, audience: 'screen' });
    expect(s8.bullets).toEqual([withheld]);
  });
});

describe('S10 roadmap', () => {
  it('points every phase at the primary constraint', () => {
    const s10 = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b))).toHaveLength(3);
  });

  it('carries a do-not-work-on bullet only for the constraint archetype', () => {
    const yes = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    const no = fallbackSection('s10', { facts: capacityFacts, methodology, reflections: [] });
    expect(yes.bullets.some((b) => b.startsWith('Do not work on yet:'))).toBe(true);
    expect(no.bullets.some((b) => b.startsWith('Do not work on yet:'))).toBe(false);
  });

  it('never throws and never drops the bullet when generosity_mode is null (ruling 6)', () => {
    // capacityFacts has generosity_mode: null.
    const s10 = fallbackSection('s10', { facts: capacityFacts, methodology, reflections: [] });
    expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b))).toHaveLength(3);
  });

  it('foundation with 2 gated enablers produces 3 x 2 = 6 phase bullets (Natalie ruling 8) — S10 is unchanged by ruling 11-REVISED', () => {
    const s10 = fallbackSection('s10', { facts: foundationFacts, methodology, reflections: [] });
    expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b))).toHaveLength(6);
  });
});

describe('S9 dependency reads (2026-08-16 review)', () => {
  // The dependency map has 13 structural edges and emitted one read sentence per edge. Three of
  // the four reads interpolate {fromName}/{toName} and so come out distinct, but `both_strong`
  // names nothing — a healthy church got "Both are strong. Nothing to flag here." 13 times
  // running. dependencyReadLines (lib/report/view.ts) collapses identical sentences to one.
  //
  // Asserted over ALL_FIXTURES, not the skeleton fixtures above: those carry 0 or 1 dependency
  // edge, so they cannot express the duplicate at all and would pass this vacuously.
  const bulletsFor = (facts: FactsPack) =>
    fallbackSection('s9', { facts, methodology, reflections: [] }).bullets;

  it('emits no duplicate bullet, for any fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const bullets = bulletsFor(facts);
      expect(new Set(bullets).size, `${name}: ${JSON.stringify(bullets)}`).toBe(bullets.length);
    }
  });

  it('states the nameless both_strong sentence exactly once where every edge produces it', () => {
    const bothStrong = methodology.copy.dependency_reads.both_strong;
    // Non-vacuity, asserted not assumed: a healthy church's RAW per-edge list really does repeat
    // this sentence many times over, so the count assertion below tests a collapse that happened.
    const raw = CAPACITY_FACTS.dependencies.filter((d) => d.read_sentence === bothStrong);
    expect(raw.length, 'CAPACITY_FACTS no longer repeats both_strong').toBeGreaterThan(1);
    expect(bulletsFor(CAPACITY_FACTS).filter((b) => b === bothStrong)).toHaveLength(1);
  });

  it('keeps every DISTINCT read sentence — dedup must not drop a real finding', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const bullets = bulletsFor(facts);
      const distinct = new Set(facts.dependencies.map((d) => d.read_sentence));
      for (const sentence of distinct) expect(bullets, `${name}: ${sentence}`).toContain(sentence);
    }
  });

  it('still carries the gating notes alongside the reads', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const bullets = bulletsFor(facts);
      for (const g of facts.gating) expect(bullets, name).toContain(`${g.name}: ${g.note}`);
    }
  });
});

describe('S11 states the offer once (2026-08-16 review — supersedes ruling 11-REVISED)', () => {
  // Ruling 11-REVISED mirrored S10's three PHASES, pairing each with the SAME archetype-level
  // offer, so every report printed one byte-identical `call_type: hook` per phase. Natalie saw
  // it three times over on a rendered capacity report; it is now stated once. S10 is unchanged.
  it('is exactly one bullet for every archetype, however many roadmap phases S10 emits', () => {
    for (const facts of [capacityFacts, constraintFacts, foundationFacts, genConstraintFacts, govConstraintFacts]) {
      const s10 = fallbackSection('s10', { facts, methodology, reflections: [] });
      const s11 = fallbackSection('s11', { facts, methodology, reflections: [] });
      // Non-vacuity: S10 really does still carry multiple phase bullets to have been mirrored.
      expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b)).length).toBeGreaterThan(1);
      expect(s11.bullets, JSON.stringify(s11.bullets)).toHaveLength(1);
    }
  });

  it('carries no day-label prefix and no em-dash separator', () => {
    // The em-dash came from the RENDERER's `${call_type} — ${hook}`, not from offers.yaml, so
    // tests/methodology/copy-register.test.ts (parsed YAML only) could never have caught it.
    for (const facts of [capacityFacts, constraintFacts, foundationFacts]) {
      const [bullet] = fallbackSection('s11', { facts, methodology, reflections: [] }).bullets;
      expect(bullet).toBeDefined();
      expect(bullet).not.toMatch(/^(30|60|90) days/);
      expect(bullet).not.toContain('\u2014');
      expect(bullet).toContain(': ');
    }
  });

  it('every S11 bullet is distinct, for every archetype including multi-enabler foundation (the covering assertion the withdrawn ruling 11 defect slipped past)', () => {
    for (const facts of [capacityFacts, constraintFacts, foundationFacts, genConstraintFacts, govConstraintFacts]) {
      const s11 = fallbackSection('s11', { facts, methodology, reflections: [] });
      expect(new Set(s11.bullets).size, JSON.stringify(s11.bullets)).toBe(s11.bullets.length);
    }
  });

  it('never throws and never drops the bullet when generosity_mode is null (ruling 6, S11 side)', () => {
    const s11 = fallbackSection('s11', { facts: capacityFacts, methodology, reflections: [] });
    expect(s11.bullets).toHaveLength(1);
  });

  it('routes to offers.generosity, not offers.no_constraint, when the primary is gen (Natalie ruling 4)', () => {
    const s11 = fallbackSection('s11', { facts: genConstraintFacts, methodology, reflections: [] });
    const expectedHook = methodology.offers.generosity.both.hook; // null generosity_mode -> 'both'
    const noConstraintHook = methodology.offers.no_constraint.hook;
    expect(s11.bullets.every((b) => b.includes(expectedHook))).toBe(true);
    expect(s11.bullets.some((b) => b.includes(noConstraintHook))).toBe(false);
  });

  it('routes capacity (no primary constraint) to offers.no_constraint (Natalie ruling 5)', () => {
    const s11 = fallbackSection('s11', { facts: capacityFacts, methodology, reflections: [] });
    expect(s11.bullets.every((b) => b.includes(methodology.offers.no_constraint.hook))).toBe(true);
  });

  it('routes foundation (no primary constraint, gated instead) to its own offers.foundation, not offers.no_constraint (Natalie ruling 12)', () => {
    const s11 = fallbackSection('s11', { facts: foundationFacts, methodology, reflections: [] });
    const foundationHook = methodology.offers.foundation.hook;
    const noConstraintHook = methodology.offers.no_constraint.hook;
    expect(foundationHook).not.toBe(noConstraintHook); // sanity: report.yaml really does differ
    expect(s11.bullets.every((b) => b.includes(foundationHook))).toBe(true);
    expect(s11.bullets.some((b) => b.includes(noConstraintHook))).toBe(false);
  });
});

// FIX ROUND A / I2: no existing test above asserts the offer TEXT on the offers.stages[primary]
// path. constraintFacts (primary = conn) is only exercised for bullet COUNT and DISTINCTNESS, so
// severing offers.stages[primaryId] in offerFor() (lib/report/fallback-sections.ts) left every
// real constraint report falling through to offers.no_constraint's "Nothing here is broken…" —
// the exact self-contradiction Natalie's ruling 12 added offers.foundation to prevent — with
// 1161/1161 green. Hooks below are HARDCODED, not derived from methodology/offers.yaml — the
// duplication IS the guard (controller error #4: a self-referential assertion survives every
// edit). Own fixture per stage; govConstraintFacts is deliberately excluded — 'gov' is an
// enabler, not a chain stage, and legitimately falls through to offers.no_constraint.
describe('S11 offers.stages[primary] hook (fix round A / I2 — test gap)', () => {
  const NO_CONSTRAINT_HOOK =
    "Nothing here is broken. Let's talk about the ceiling you'll hit next, not the one you're hitting now.";

  it.each([
    ['guest', "You may be paying for guests you aren't keeping."],
    ['conn', 'Your church may feel more connected than it is.'],
    ['disc', "Your ceiling isn't your building. It's the number of people who can lead."],
    ['vol', 'You may be one burnout away from three ministries stopping.'],
  ])('routes primary=%s to its own offers.stages entry, with the exact hook — NOT offers.no_constraint', (id, hook) => {
    const facts: FactsPack = buildFacts({
      ...baseArgs,
      diagnosis: makeDiagnosis({ primary_constraint: { category_id: id } }),
    });
    const s11 = fallbackSection('s11', { facts, methodology, reflections: [] });
    // Array.every() is TRUE for an empty array, so the hook assertion below would pass vacuously
    // if a mutation emptied the bullets — the same fail-open shape as indexOf's -1 sentinel in I1.
    expect(s11.bullets.length).toBeGreaterThan(0);
    expect(s11.bullets.every((b) => b.includes(hook)), JSON.stringify(s11.bullets)).toBe(true);
    expect(s11.bullets.some((b) => b.includes(NO_CONSTRAINT_HOOK)), JSON.stringify(s11.bullets)).toBe(false);
  });
});

// Ruling 7 — the highest-risk lookup in this task: report.yaml carries BOTH
// action_library.categories.{gov,comm,sys} and action_library.enablers.{gov,comm,sys} with
// DIFFERENT text for the same ids. These tests assert the EXACT text from each bucket, so
// picking the wrong bucket fails on content, not just on count.
describe('S10 action_library path (Natalie/controller ruling 7)', () => {
  it('constraint archetype reads action_library.categories[primary], not .enablers[primary]', () => {
    // govConstraintFacts (top-level fixture): primary is an enabler-shaped id (gov) that ALSO
    // exists under .enablers, to prove the categories bucket (not the enablers bucket) is read.
    const s10 = fallbackSection('s10', { facts: govConstraintFacts, methodology, reflections: [] });
    const categoriesAlign = methodology.report.action_library.categories.gov!.align;
    const enablersAlign = methodology.report.action_library.enablers.gov!.align;
    expect(categoriesAlign).not.toBe(enablersAlign); // sanity: report.yaml really does differ
    expect(s10.bullets.some((b) => b.includes(categoriesAlign))).toBe(true);
    expect(s10.bullets.some((b) => b.includes(enablersAlign))).toBe(false);
  });

  it('foundation archetype reads action_library.enablers[enabler_id], not .categories[enabler_id]', () => {
    const s10 = fallbackSection('s10', { facts: foundationFacts, methodology, reflections: [] });
    const categoriesCommAlign = methodology.report.action_library.categories.comm!.align;
    const enablersCommAlign = methodology.report.action_library.enablers.comm!.align;
    const categoriesSysAlign = methodology.report.action_library.categories.sys!.align;
    const enablersSysAlign = methodology.report.action_library.enablers.sys!.align;
    expect(categoriesCommAlign).not.toBe(enablersCommAlign);
    expect(categoriesSysAlign).not.toBe(enablersSysAlign);
    expect(s10.bullets.some((b) => b.includes(enablersCommAlign))).toBe(true);
    expect(s10.bullets.some((b) => b.includes(enablersSysAlign))).toBe(true);
    expect(s10.bullets.some((b) => b.includes(categoriesCommAlign))).toBe(false);
    expect(s10.bullets.some((b) => b.includes(categoriesSysAlign))).toBe(false);
  });

  it('capacity archetype reads action_library.generosity[mode], falling back to both when null', () => {
    const s10 = fallbackSection('s10', { facts: capacityFacts, methodology, reflections: [] });
    const bothAlign = methodology.report.action_library.generosity.both.align;
    expect(s10.bullets.some((b) => b.includes(bothAlign))).toBe(true);
  });
});

describe('S6 area beats', () => {
  it('uses copy.inserts.dispersion (not copy.blocks.dispersion) for the reframe beat', () => {
    const facts: FactsPack = {
      ...capacityFacts,
      dispersion: [{ category_id: capacityFacts.categories[3]!.id, name: capacityFacts.categories[3]!.name, spread: 3.2 }],
    };
    const s6 = fallbackSection('s6', { facts, methodology, reflections: [] });
    const target = facts.categories.slice(3).findIndex((c) => c.id === facts.categories[3]!.id);
    const expectedLine = methodology.copy.inserts.dispersion!
      .replace('{disp_name}', facts.categories[3]!.name)
      .replace('{disp_spread}', '3.2');
    expect(s6.bullets[target]).toContain(expectedLine);
  });

  it('uses copy.blocks.blind_spot for the evidence beat, with belief and evidence in their OWN slots', () => {
    const target = capacityFacts.categories[3]!;
    const facts: FactsPack = {
      ...capacityFacts,
      // belief 80 / evidence 40 / gap 40 deliberately differ, and the assertion below is
      // ORDER-SENSITIVE: the old `toContain('80')` + `toContain('40')` pair passed unchanged
      // when bs_belief and bs_evidence were swapped in fallback-sections.ts's evidenceBeat(),
      // which tells a church its leaders believe 40 when they believe 80. (gap: 40 also made
      // '40' appear twice, so the old pair even survived dropping bs_evidence altogether.)
      blind_spots: [{ category_id: target.id, name: target.name, belief: 80, evidence: 40, gap: 40 }],
    };
    const s6 = fallbackSection('s6', { facts, methodology, reflections: [] });
    const idx = facts.categories.slice(3).findIndex((c) => c.id === target.id);
    expect(s6.bullets[idx]).toContain(target.name);
    // Hardcoded, NOT interpolated from methodology/copy.yaml — the duplication is what makes the
    // slot binding (belief in the belief slot, evidence in the evidence slot) observable
    // independently of the template the implementation reads.
    expect(s6.bullets[idx]).toContain('Belief sits at 80, the evidence at 40, a gap of 40 points.');
  });
});

// Replaces the two appendixBullets tests. The appendix section was removed on 2026-08-16, so
// what needs guarding is that its content did not quietly reappear on a neighbouring section:
// the IDS key-set equality above already pins the twelve, but a stray `Confidence: 0.85.` or
// small-sample bullet re-added to s12 would pass that and still put the removed panel back in
// front of a reader. Asserted over ALL_FIXTURES, and over the sub-8-respondent fixture that
// used to be the ONLY input producing the small-sample line — checking a 40-respondent church
// would pass vacuously.
describe('the removed appendix disclosures', () => {
  const REMOVED = ['Confidence:', 'Small sample:', 'provisional priors', 'working model of how'];

  it('appear on no section, at any respondent count', () => {
    const small = { ...capacityFacts, cover: { ...capacityFacts.cover, respondent_count: 3 } };
    for (const facts of [capacityFacts, constraintFacts, foundationFacts, small]) {
      const all = fallbackSections({ facts, methodology, reflections: [] });
      const text = IDS.map((id) => `${all[id].body} ${all[id].bullets.join(' ')}`).join(' ');
      for (const phrase of REMOVED) expect(text, phrase).not.toContain(phrase);
    }
  });
});

describe('s3 executive dashboard', () => {
  it('emits exactly one bullet — the XPG read — with the chart carrying the scores', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const s3 = fallbackSection('s3', { facts, methodology, reflections: [] });
      expect(s3.bullets, name).toHaveLength(1);
      expect(s3.bullets[0]!.length, name).toBeGreaterThan(0);
    }
  });

  it('reads the XPG line off archetype x tier, not off a single flat string', () => {
    const seen = new Set(
      ALL_FIXTURES.map(({ facts }) => fallbackSection('s3', { facts, methodology, reflections: [] }).bullets[0]!),
    );
    // The fixtures span 3 archetypes and >=2 tiers, so a hardcoded line would collapse to one.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('matches copy.yaml exactly for a known archetype/tier pair', () => {
    const s3 = fallbackSection('s3', { facts: CAPACITY_FACTS, methodology, reflections: [] });
    expect(s3.bullets[0]).toBe(
      methodology.copy.xpg_read[CAPACITY_FACTS.archetype][CAPACITY_FACTS.overall.tier.id],
    );
  });

  it('no longer repeats the eight per-area score lines the chart now shows', () => {
    const s3 = fallbackSection('s3', { facts: CAPACITY_FACTS, methodology, reflections: [] });
    for (const c of CAPACITY_FACTS.categories) {
      expect(s3.bullets.join(' ')).not.toContain(`${c.name}: ${c.score} out of 100`);
    }
  });
});

/**
 * Step D — S7 carries the areas-needing-work punch list.
 *
 * Natalie's ruling: ALL eight sub-80 areas, ranked worst-first, each with its own weak
 * questions, rendered INSIDE s7 rather than as a thirteenth section.
 */
describe('S7 areas needing work (step D)', () => {
  const facts = CAPACITY_FACTS; // every area 49-72, so all eight are below the 80 standard
  const s7 = () => fallbackSection('s7', { facts, methodology, reflections: [] });

  it('emits one bullet per area below the standard, worst area first', () => {
    const expected = facts.improvement.areas_needing_work;
    expect(expected).toHaveLength(8); // fixture guard: the ruling is "all eight", not a worst-N cap
    const bullets = s7().bullets;
    for (const [i, area] of expected.entries()) {
      expect(bullets[i]).toContain(area.name);
    }
    // worst first: the fixture's own ranking is score-ascending
    expect(expected.map((a) => a.score)).toEqual([...expected.map((a) => a.score)].sort((x, y) => x - y));
  });

  it('gives each area its score and its gap to the standard', () => {
    const worst = facts.improvement.areas_needing_work[0]!;
    const bullet = s7().bullets[0]!;
    expect(bullet).toContain(`${worst.score} out of 100`);
    expect(bullet).toContain(`${worst.gap_to_standard} points below the standard of ${facts.improvement.standard}`);
  });

  it("lists an area's own weak questions inside its own bullet, and no other area's", () => {
    const areas = facts.improvement.areas_needing_work;
    const withItems = areas.filter((a) => a.weak_items.length > 0);
    expect(withItems.length).toBeGreaterThan(1); // guard: otherwise "no other area's" is vacuous
    const bullets = s7().bullets;
    for (const [i, area] of areas.entries()) {
      const bullet = bullets[i]!;
      for (const item of area.weak_items) {
        expect(bullet).toContain(item.text);
        expect(bullet).toContain(`${item.mean} out of 100`);
      }
      for (const other of areas) {
        if (other.category_id === area.category_id) continue;
        for (const item of other.weak_items) expect(bullet).not.toContain(item.text);
      }
    }
  });

  it('says so plainly when an area is below the standard with no question below it', () => {
    const bare = facts.improvement.areas_needing_work.filter((a) => a.weak_items.length === 0);
    expect(bare.length).toBeGreaterThan(0); // fixture guard
    const bullets = s7().bullets;
    for (const area of bare) {
      const bullet = bullets.find((b) => b.startsWith(area.name))!;
      expect(bullet).toContain('No individual question in this area is below the standard');
    }
  });

  it('no longer repeats the six lowest indicators as their own bullets', () => {
    const bullets = s7().bullets;
    for (const b of facts.bottom_items) {
      expect(bullets).not.toContain(`${b.text} — ${b.mean} out of 100 (${b.theme}).`);
    }
  });

  it('still lists the six lowest indicators when no area is below the standard', () => {
    const healthy = makeFacts({
      categories: CAPACITY_FACTS.categories.map((c) => ({ ...c, score: 85 })),
    });
    expect(healthy.improvement.areas_needing_work).toEqual([]); // fixture guard
    const bullets = fallbackSection('s7', { facts: healthy, methodology, reflections: [] }).bullets;
    expect(bullets.length).toBeGreaterThan(0);
    for (const b of healthy.bottom_items) {
      expect(bullets).toContain(`${b.text} — ${b.mean} out of 100 (${b.theme}).`);
    }
  });

  it('keeps the absent-theme pattern lines', () => {
    const oneTheme = makeFacts({
      bottom_items: CAPACITY_FACTS.bottom_items.map((b) => ({ ...b, theme: 'systems' as const })),
    });
    const bullets = fallbackSection('s7', { facts: oneTheme, methodology, reflections: [] }).bullets;
    for (const theme of ['culture', 'theology', 'relational']) {
      expect(bullets).toContain(`None of the six lowest indicators are ${theme}.`);
    }
  });
});
