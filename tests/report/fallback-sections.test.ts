import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '@/lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '@/lib/report/facts';
import { fallbackSection, fallbackSections } from '@/lib/report/fallback-sections';

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

const IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 'appendix'] as const;

describe.each([
  ['capacity', capacityFacts],
  ['constraint', constraintFacts],
  ['foundation', foundationFacts],
] as const)('%s archetype', (archetype, facts) => {
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
    for (const phrase of methodology.report.banned_phrases[archetype]) {
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
    const s8 = fallbackSection('s8', {
      facts: { ...capacityFacts, themes: [] },
      methodology,
      reflections: [{ item_id: reflectionItemId, reflection: 'greeters are great' }],
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

  it('foundation with 2 gated enablers produces 3 x 2 = 6 phase bullets (Natalie ruling 8)', () => {
    const s10 = fallbackSection('s10', { facts: foundationFacts, methodology, reflections: [] });
    expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b))).toHaveLength(6);
  });
});

describe('S11 mirrors S10', () => {
  it('has one bullet per roadmap phase', () => {
    const s10 = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    const s11 = fallbackSection('s11', { facts: constraintFacts, methodology, reflections: [] });
    expect(s11.bullets).toHaveLength(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b)).length);
  });

  it('mirrors S10 per-bullet for the foundation archetype too (controller ruling 11): ' +
    '3 x gatedEnablerCount on both sides', () => {
    const s10 = fallbackSection('s10', { facts: foundationFacts, methodology, reflections: [] });
    const s11 = fallbackSection('s11', { facts: foundationFacts, methodology, reflections: [] });
    const s10PhaseBullets = s10.bullets.filter((b) => /^(30|60|90) days — /.test(b));
    expect(s10PhaseBullets).toHaveLength(3 * foundationFacts.gating.length);
    expect(s11.bullets).toHaveLength(s10PhaseBullets.length);
  });

  it('never throws and never drops the bullet when generosity_mode is null (ruling 6, S11 side)', () => {
    const s11 = fallbackSection('s11', { facts: capacityFacts, methodology, reflections: [] });
    expect(s11.bullets).toHaveLength(3);
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
});

// Ruling 7 — the highest-risk lookup in this task: report.yaml carries BOTH
// action_library.categories.{gov,comm,sys} and action_library.enablers.{gov,comm,sys} with
// DIFFERENT text for the same ids. These tests assert the EXACT text from each bucket, so
// picking the wrong bucket fails on content, not just on count.
describe('S10 action_library path (Natalie/controller ruling 7)', () => {
  it('constraint archetype reads action_library.categories[primary], not .enablers[primary]', () => {
    // Use a constraint fixture whose primary is an enabler-shaped id that ALSO exists under
    // .enablers, to prove the categories bucket (not the enablers bucket) is read.
    const govConstraintFacts: FactsPack = buildFacts({
      ...baseArgs,
      diagnosis: makeDiagnosis({
        categories: CAT_IDS.map((id, i) =>
          makeCategory(id, [72, 68, 66, 61, 58, 20, 55, 64][i]!, { state: id === 'gov' ? 'broken' : 'ok' }),
        ),
        primary_constraint: { category_id: 'gov' },
      }),
    });
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

  it('uses copy.blocks.blind_spot for the evidence beat when a blind spot is present', () => {
    const target = capacityFacts.categories[3]!;
    const facts: FactsPack = {
      ...capacityFacts,
      blind_spots: [{ category_id: target.id, name: target.name, belief: 80, evidence: 40, gap: 40 }],
    };
    const s6 = fallbackSection('s6', { facts, methodology, reflections: [] });
    const idx = facts.categories.slice(3).findIndex((c) => c.id === target.id);
    expect(s6.bullets[idx]).toContain(target.name);
    expect(s6.bullets[idx]).toContain('80');
    expect(s6.bullets[idx]).toContain('40');
  });
});

describe('appendix', () => {
  it('uses copy.inserts.benchmark_note/dependency_note (not copy.blocks)', () => {
    const s = fallbackSection('appendix', { facts: capacityFacts, methodology, reflections: [] });
    expect(s.bullets[0]).toBe(methodology.copy.inserts.benchmark_note);
    expect(s.bullets[1]).toBe(methodology.copy.inserts.dependency_note);
  });

  it('adds the small-sample bullet only under 8 respondents', () => {
    const small = { ...capacityFacts, cover: { ...capacityFacts.cover, respondent_count: 3 } };
    const large = { ...capacityFacts, cover: { ...capacityFacts.cover, respondent_count: 40 } };
    expect(
      fallbackSection('appendix', { facts: small, methodology, reflections: [] }).bullets.some((b) => b.startsWith('Small sample:')),
    ).toBe(true);
    expect(
      fallbackSection('appendix', { facts: large, methodology, reflections: [] }).bullets.some((b) => b.startsWith('Small sample:')),
    ).toBe(false);
  });
});
