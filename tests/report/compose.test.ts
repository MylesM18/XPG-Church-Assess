import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// R6 / recon D13: compose.ts imports composeSection, SECTION_REGISTRY AND AI_SECTION_IDS from
// the same module, so a naive factory returning only { composeSection } would wipe out the
// registry and AI_SECTION_IDS too — every SECTION_REGISTRY[id].schema access inside
// assembleReport would break at runtime. importOriginal keeps every other real export intact.
// There is no precedent file in this repo for this partial-mock idiom (recon D13) — this block
// is the source of truth, not copied from elsewhere.
const { mockComposeSection } = vi.hoisted(() => ({ mockComposeSection: vi.fn() }));

vi.mock('@/lib/ai/sections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/sections')>();
  return { ...actual, composeSection: mockComposeSection };
});

// Imported AFTER the mock is declared (vitest hoists vi.mock above imports regardless) — same
// convention as tests/ai/sections.test.ts's own comment.
import { composeReport, assembleReport, assembleFallbackOnly, chartsForSection, isUsableCachedReport } from '../../lib/report/compose';
import { AI_SECTION_IDS, SECTION_REGISTRY, type AiSectionId } from '../../lib/ai/sections';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '../../lib/report/facts';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

// Fixture Construction Kit — copied verbatim from task-8-recon.md §1 (itself copied from
// tests/ai/section-gates.test.ts:1-153), per controller ruling R8: gateSection stays REAL in
// this suite (only composeSection is mocked), so every good(id) payload below must genuinely
// pass all six gate families for its id against constraintFacts. No shared fixture module
// (R8) — inline duplication here is accepted debt on this plan.

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

const goodS2 = {
  summary: `Overall health sits at ${constraintFacts.overall.capacity} out of 100, in the ${constraintFacts.overall.tier.name} band. ${constraintFacts.primary_constraint!.name} is holding the rest back.`,
  what_this_is_not: 'This is not a verdict on anyone.',
  context_bullets: [],
};

const good = (id: AiSectionId): unknown => {
  switch (id) {
    case 's2':
      return goodS2; // verbatim from section-gates.test.ts, already gate-proven
    case 's4':
      return {
        thesis_word: 'Connection',
        narrative: `Community / Connection is the constraint holding the rest of the chain back at ${constraintFacts.overall.capacity} out of 100, in the ${constraintFacts.overall.tier.name} band.`,
      };
    case 's5':
      return {
        strengths: [
          { category_id: 'guest', heading: 'Guest Experience', body: 'Guest Experience scores 72 out of 100, the strongest area in the assessment.' },
          { category_id: 'gov', heading: 'Governance / Accountability', body: 'Governance sits at 70 out of 100 and is carrying real weight.' },
          { category_id: 'disc', heading: 'Discipleship / Leadership', body: 'Discipleship / Leadership scores 66 out of 100.' },
        ],
      };
    case 's6':
      // Gate 1b requires FULL coverage of the section's slice, not just known, unique ids. s6's
      // slice is buildFacts' score-desc remainder — sys, vol, gen, comm, conn — so all five must
      // appear. This mock carried `conn` alone until the completeness check landed: one of five,
      // every id valid, and it passed as a well-formed s6 everywhere it was used.
      //
      // Same hardcoded-and-sort-dependent form as the s5 case above; if the score vector at :117
      // changes, both lists move together. The `conn` entry is kept verbatim because it is the
      // gate-proven one (its 70/100 are in-slice for gate 2); the other four are deliberately
      // digit-free so they cannot introduce a numeric-containment failure of their own.
      // pivot/not_statement/trajectory are deliberately digit-free, same reasoning as the other
      // four (below) — this mock predates Task 9's three new beats but must still clear gate 2
      // (numeric containment, scoped to s6's own widened slice) with no new invented numbers, and
      // clear the constraint archetype's banned_phrases list.
      return {
        areas: [
          {
            category_id: 'conn',
            affirm: 'Community / Connection has real strengths worth naming.',
            pivot: 'It sits well behind the areas already carrying this church forward.',
            evidence: 'The connection pathway from guest to committed member is inconsistent.',
            not_statement: 'This is not a sign people do not care — the path itself is not built yet.',
            reframe: 'Overall health still sits at 70 out of 100, so this is one fixable link, not a collapse.',
            trajectory: 'Left as is, that gap will keep widening rather than closing.',
          },
          {
            category_id: 'sys',
            affirm: 'Systems work is further along here than most teams expect.',
            pivot: 'It trails the strongest areas, but not by a wide margin.',
            evidence: 'Process lives with a few people rather than in anything written down.',
            not_statement: 'This is not a motivation problem — the documentation has not caught up.',
            reframe: 'Read this as knowledge worth capturing, not as a failure to organise.',
            trajectory: 'The current trend will not close that gap without a deliberate push.',
          },
          {
            category_id: 'vol',
            affirm: 'Volunteers are willing and turn up when they are asked.',
            pivot: 'It sits behind the areas already carrying the most weight.',
            evidence: 'Recruitment leans on personal invitation from the same handful of leaders.',
            not_statement: 'This is not a willingness problem — the invitation itself is too narrow.',
            reframe: 'The willingness is already there; what is missing is a repeatable path into it.',
            trajectory: 'That reliance on a few leaders will not resolve on its own.',
          },
          {
            category_id: 'gen',
            affirm: 'Generosity is steady and quietly carries more than it is credited for.',
            pivot: 'It falls short of the areas leading the rest of the chain.',
            evidence: 'Giving is concentrated among long-tenured members rather than broadly shared.',
            not_statement: 'This is not a scarcity problem — the base of givers is simply narrow.',
            reframe: 'This is a breadth question, not a commitment question.',
            trajectory: 'Without broadening that base, the concentration will only deepen.',
          },
          {
            category_id: 'comm',
            affirm: 'Communication reaches the people already close to the centre.',
            pivot: 'It lags behind the areas already carrying real weight.',
            evidence: 'Announcements repeat across channels without a clear primary one.',
            not_statement: 'This is not an effort problem — the channels simply compete with each other.',
            reframe: 'Treat this as a focus problem rather than an effort problem.',
            trajectory: 'That channel sprawl will not resolve without a clear primary one.',
          },
        ],
      };
    case 's7':
      return {
        narrative: 'The six lowest-scoring indicators sit well below the 70 out of 100 overall figure and cluster around the same few themes.',
        pattern_claim: null, // null trivially skips gate 5 entirely
      };
    case 's9':
      return {
        narrative: 'Community / Connection is the constraint. It caps the 66 out of 100 ceiling on Discipleship / Leadership immediately downstream, at a base score of 30.',
        working_model: 'Overall capacity sits at 70 out of 100; the working model traces every downstream effect back to Community / Connection.',
      };
    case 's12':
      return {
        assessment: `Grace Chapel sits at 70 out of 100, in the ${constraintFacts.overall.tier.name} band.`,
        overall_percent: 70,
        tier_name: constraintFacts.overall.tier.name,
        primary_objective: 'Community / Connection is the objective for the next ninety days.',
      };
  }
};

// R1 / recon D1 / recon §4: the brief's own logging test cannot pass by mocking composeSection
// to return null — compose.ts's attempt() only console.warns on the GATE branch (the real
// composeSection already logs its own call-failure reasons internally, so compose.ts
// deliberately does not double-log a null return). Fail a section via a genuine gate rejection
// instead, using the proven numeric-invention trick from tests/ai/section-gates.test.ts:172.
function gateFailingS2() {
  return { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' };
}
// Overshoots s2's length ceiling by exactly 434 characters, so the gate's detail reads
// "1834/1400" — the spec's worked example — and the assertion on '1400' cannot be satisfied
// accidentally by the ceiling appearing twice in the corrective.
//
// The plan's sketch REPLACED `summary` with filler. That would trip gate 3 first, not gate 6:
// goodS2's summary is the only field carrying the tier name, the overall percent and
// "Community / Connection", so replacing it fails `required mention` before the length gate is
// ever reached — and this test exists to assert the LENGTH corrective. Pad instead of replace,
// and keep the filler digit-free so gate 2 stays clear.
function overlongS2() {
  const ceiling = methodology.report.sections.s2.length_ceiling;
  const base = `${goodS2.summary} ${goodS2.what_this_is_not}`.length;
  return { ...goodS2, what_this_is_not: `${goodS2.what_this_is_not} ${'x'.repeat(ceiling + 434 - base - 1)}` };
}

// The s12 twin of overlongS2 above, and deliberately a DIFFERENT ceiling: s12's is 900 where
// s2's is 1400, so a corrective built from another section's ceiling is visible. Overshoots by
// the same 434 characters, so the detail reads "1334/900" — a measured overage containing
// neither "900" nor "128", so neither ceiling assertion can be satisfied by the overage instead.
//
// Pads rather than replaces, for the same reason overlongS2 does: s12's required_mentions are
// [tier_name, overall_percent] (report.yaml) and `assessment` is the only field carrying both,
// so replacing it fails gate 3 before gate 6 is ever reached. `overall_percent` is a NUMBER
// field, which allStrings never collects — the base below is the three string fields only.
function overlongS12() {
  const s12 = good('s12') as { assessment: string; overall_percent: number; tier_name: string; primary_objective: string };
  const ceiling = methodology.report.sections.s12.length_ceiling;
  const base = `${s12.assessment} ${s12.tier_name} ${s12.primary_objective}`.length;
  return { ...s12, primary_objective: `${s12.primary_objective} ${'x'.repeat(ceiling + 434 - base - 1)}` };
}

// One entry short of s5's three-category slice. Every id present is still known and unique, so
// only gate 1b's COMPLETENESS check catches it — and S5Schema's array carries no `.min()`, so
// gate 1's safeParse passes first and the failure is genuinely `category coverage`, not
// `field parity`. Drops `disc` rather than truncating, so the two survivors stay gate-proven.
function shortS5() {
  const s5 = good('s5') as { strengths: { category_id: string }[] };
  return { strengths: s5.strengths.filter((s) => s.category_id !== 'disc') };
}

// D2. A REAL gate-3 failure for s12, whose required_mentions are [tier_name, overall_percent].
// The tier name lives in BOTH `assessment` and the `tier_name` field, so it has to be scrubbed
// from both or gate 3 never fires. "70 out of 100" stays: gate 2 runs FIRST and would otherwise
// reject an unknown number, and `overall_percent` — the other required mention — must still
// resolve, so that the failure detail is unambiguously `tier_name`.
function s12MissingTierName() {
  const s12 = good('s12') as Record<string, unknown>;
  return { ...s12, assessment: 'Grace Chapel sits at 70 out of 100.', tier_name: 'Unstated' };
}

// A fanned section's unit call must return ONLY its own entry: under a unit, gate 1b's known set
// is that single id, so the full five-area payload fails `unknown:` on the four siblings. Every
// mock in this file routes through here so that stays true in one place.
function goodUnit(id: AiSectionId, key: string): unknown {
  if (id !== 's6') throw new Error(`no fan-out fixture for ${id}`);
  const s6 = good('s6') as { areas: Array<{ category_id: string }> };
  const areas = s6.areas.filter((a) => a.category_id === key);
  if (areas.length !== 1) throw new Error(`no s6 fixture area for unit ${key}`);
  return { areas };
}
/** `key` is null for an unfanned section, the category id for a fanned one. */
function mockSections(fn: (id: AiSectionId, key: string | null) => unknown) {
  mockComposeSection.mockImplementation(
    async (id: AiSectionId, _f: unknown, _m: unknown, _c?: string | null, unitKey?: string) =>
      fn(id, unitKey ?? null),
  );
}
function mockAllSectionsGood() {
  mockSections((id, key) => (key === null ? good(id) : goodUnit(id, key)));
}
/** The unit list composeReport itself derives, for call-count expectations. */
const S6_UNIT_IDS = constraintFacts.categories.slice(3).map((c) => c.id);
const UNIT_COUNT = AI_SECTION_IDS.length - 1 + S6_UNIT_IDS.length; // 6 + 5 = 11
function mockSectionsThrow() {
  mockComposeSection.mockRejectedValue(new Error('boom'));
}

beforeEach(() => {
  mockComposeSection.mockReset();
});

describe('composeReport', () => {
  it('marks every section ai when all seven calls pass their gates', async () => {
    mockAllSectionsGood();
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    for (const id of AI_SECTION_IDS) expect(r.section_sources[id], id).toBe('ai');
  });

  it('marks the deterministic sections fallback always', async () => {
    mockAllSectionsGood();
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    for (const id of ['s1', 's3', 's8', 's10', 's11'] as const) {
      expect(r.section_sources[id], id).toBe('fallback');
    }
  });

  it('re-attempts only the failed sections, exactly once', async () => {
    const calls: string[] = [];
    mockSections((id, key) => {
      if (id !== 's6') return good(id);
      calls.push(key!);
      return calls.filter((c) => c === key).length === 1 && key === S6_UNIT_IDS[0] ? null : goodUnit(id, key!);
    });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(calls.filter((c) => c === S6_UNIT_IDS[0])).toHaveLength(2); // one re-attempt
    for (const k of S6_UNIT_IDS) {
      if (k === S6_UNIT_IDS[0]) continue;
      expect(calls.filter((c) => c === k), k).toHaveLength(1); // every other unit untouched
    }
    expect(r.section_sources.s6).toBe('ai');
  });

  it('re-attempts a gate failure as well as a call failure', async () => {
    // The model is nondeterministic, so a re-roll is a genuine fix, not a hope (C2).
    let n = 0;
    mockSections((id, key) => (id === 's2' ? (++n === 1 ? gateFailingS2() : good('s2')) : key === null ? good(id) : goodUnit(id, key)));
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(n).toBe(2);
    expect(r.section_sources.s2).toBe('ai');
  });

  it('gives up after the single re-attempt and persists a partial report', async () => {
    mockSections((id, key) => (id === 's6' ? null : good(id)));
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(r.section_sources.s6).toBe('fallback');
    expect(r.sections.s6).toBeUndefined();
    expect(r.section_sources.s2).toBe('ai'); // partial persists (C3)
  });

  it('never throws when every call rejects', async () => {
    mockSectionsThrow();
    await expect(composeReport({ facts: constraintFacts, methodology, labels: [] })).resolves.toBeDefined();
  });

  // R2 / recon D2: retitled — "and nothing when AI is off" is dropped. composeReport never
  // reads process.env and has no AI-off branch; that invariant is a Task 10 requirement (the
  // PROSE_MODE gate wraps the whole composeReport call at Task 10's call site) and is proven
  // there, not here.
  it('logs the gate-failure reason for a failed section', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSections((id, key) => {
      if (id !== 's6') return good(id);
      const u = goodUnit(id, key!) as { areas: Array<{ reframe: string }> };
      return key === S6_UNIT_IDS[0]
        ? { areas: u.areas.map((a) => ({ ...a, reframe: `${a.reframe} Growth is up 37 percent.` })) }
        : u;
    });
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    const joined = warn.mock.calls.flat().join(' ');
    // R9: assert the distinguishing <reason> text, not just the shared "[report] section s6 unit
    // <id>:" prefix — a prior task shipped an untested branch exactly that way, when two
    // different failure modes shared the same prefix. The invented "37 percent" trips gate 2
    // (numeric containment), not gate 1 (field parity) — assert both the reason that DID fire and
    // a negative assertion for a plausible reason that did NOT, so a fall-through is detectable.
    expect(joined).toContain('[report] section s6 unit ' + S6_UNIT_IDS[0] + ': numeric containment');
    expect(joined).not.toContain('field parity');
    warn.mockRestore();
  });

  it('sends the corrective instruction on the re-attempt of a length failure', async () => {
    // Dedicated per-section counter, matching the idiom at :299-307 — the plan's own sketch used
    // a counter over every section's calls, which is fragile the moment call order shifts.
    const correctives: (string | null)[] = [];
    let s2Calls = 0;
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's2') return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
        s2Calls += 1;
        correctives.push(corrective ?? null);
        return Promise.resolve(s2Calls === 1 ? overlongS2() : good('s2'));
      },
    );
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(s2Calls).toBe(2);
    const s2Corrective = correctives[1]!;
    expect(s2Corrective).toContain('1834'); // the MEASURED overage, not just the ceiling
    expect(s2Corrective).toContain('1400');
    expect(s2Corrective).toContain('200'); // wordBudget(1400) — same framing as attempt one
    expect(s2Corrective.toLowerCase()).toContain('shorter');
    expect(r.section_sources.s2).toBe('ai');
  });

  // The re-attempt maps over `failed`, so each corrective must be built from ITS OWN entry's
  // failure and ITS OWN id's ceiling. With a single failing section that pairing is
  // unfalsifiable — every wiring produces the same string. Fail TWO at once, with different
  // families and different ceilings, and a crossed pair is visible from either side.
  it('pairs each failed section with its own failure when two fail at once', async () => {
    const s12Correctives: (string | null)[] = [];
    const s5Correctives: (string | null)[] = [];
    let s12Calls = 0;
    let s5Calls = 0;
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id === 's12') {
          s12Calls += 1;
          s12Correctives.push(corrective ?? null);
          return Promise.resolve(s12Calls === 1 ? overlongS12() : good('s12'));
        }
        if (id === 's5') {
          s5Calls += 1;
          s5Correctives.push(corrective ?? null);
          return Promise.resolve(s5Calls === 1 ? shortS5() : good('s5'));
        }
        return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
      },
    );
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(s12Calls).toBe(2);
    expect(s5Calls).toBe(2);

    // s12 — a LENGTH corrective carrying s12's OWN ceiling and its own word budget.
    const s12Corrective = s12Correctives[1]!;
    expect(s12Corrective).toContain('1334'); // the measured overage
    expect(s12Corrective).toContain('900'); // s12's ceiling...
    expect(s12Corrective).toContain('128'); // ...and wordBudget(900) = floor(900/7)
    expect(s12Corrective).not.toContain('1400'); // never s2's ceiling
    expect(s12Corrective).not.toContain('2200'); // never s5's — the OTHER failing section's
    expect(s12Corrective).not.toContain('guest'); // nor s5's family of corrective

    // s5 — a COVERAGE corrective naming s5's own slice, with no length arithmetic at all.
    const s5Corrective = s5Correctives[1]!;
    expect(s5Corrective).toContain('guest, gov, disc');
    expect(s5Corrective).not.toMatch(/\d/); // no ceiling, no budget, no measured length
    expect(s5Corrective.toLowerCase()).not.toContain('characters');

    expect(r.section_sources.s12).toBe('ai');
    expect(r.section_sources.s5).toBe('ai');
  });

  // D2's load-bearing test. correctiveInstruction's own unit tests hand it a `requiredValue`, so
  // they stay green even if compose.ts never populates one and every real corrective still says
  // "tier_name". Only a genuine gate-3 rejection driven through composeReport proves the CALL
  // SITE resolves the key against this church's facts.
  it('resolves a required mention to its value in the corrective, never the schema key', async () => {
    const correctives: (string | null)[] = [];
    let s12Calls = 0;
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's12') return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
        s12Calls += 1;
        correctives.push(corrective ?? null);
        return Promise.resolve(s12Calls === 1 ? s12MissingTierName() : good('s12'));
      },
    );
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(s12Calls).toBe(2);
    const s12Corrective = correctives[1]!;
    expect(s12Corrective).toBe(
      `Your response must state "${constraintFacts.overall.tier.name}" somewhere in the prose.`,
    );
    // The key is a schema identifier the model has never seen; it must not reach the prompt.
    expect(s12Corrective).not.toContain('tier_name');
    // Non-vacuity: a tier name equal to the key, or empty, would make the pair above trivial.
    expect(constraintFacts.overall.tier.name).not.toBe('tier_name');
    expect(constraintFacts.overall.tier.name.length).toBeGreaterThan(0);
    expect(r.section_sources.s12).toBe('ai');
  });

  it('sends NO corrective after an anonymity failure, and never the label', async () => {
    const label = 'priscilla vandermeer';
    const correctives: (string | null)[] = [];
    let n = 0;
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's2') return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
        correctives.push(corrective ?? null);
        n += 1;
        // Hung on what_this_is_not, not summary: summary carries s2's required mentions, and
        // gate 3 fires before gate 4 would ever see the label.
        return Promise.resolve(n === 1 ? { ...goodS2, what_this_is_not: `${label} disagreed.` } : good('s2'));
      },
    );
    await composeReport({ facts: constraintFacts, methodology, labels: [label] });
    expect(n).toBe(2); // it DID re-attempt
    expect(correctives[1]).toBeNull(); // ...blind
    const joined = correctives.map((c) => c ?? '').join(' ');
    expect(joined.toLowerCase()).not.toContain(label);
  });

  it('sends no corrective when the call itself failed (no gate ran)', async () => {
    const correctives: (string | null)[] = [];
    let n = 0;
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's6' || unitKey !== S6_UNIT_IDS[0]) {
          return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
        }
        correctives.push(corrective ?? null);
        n += 1;
        return Promise.resolve(n === 1 ? null : good('s6'));
      },
    );
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(correctives).toEqual([null, null]);
  });

  it('sends no corrective on any first attempt', async () => {
    const seen: (string | null)[] = [];
    mockComposeSection.mockImplementation(
      (id: AiSectionId, _f: unknown, _m: unknown, c?: string | null, unitKey?: string) => {
        seen.push(c ?? null);
        return Promise.resolve(unitKey ? goodUnit(id, unitKey) : good(id));
      },
    );
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(seen).toHaveLength(UNIT_COUNT);
    expect(seen.every((c) => c === null)).toBe(true);
  });
});

// THE load-bearing block (design §6). Without (1)-(4) the entire call-site wiring could be
// absent and Tasks 1-3's tests stay green.
describe('composeReport fans s6 out one call per category (design §3.6)', () => {
  it('has five distinct s6 units to assert against', () => {
    expect(S6_UNIT_IDS).toHaveLength(5);
    expect(new Set(S6_UNIT_IDS).size).toBe(5);
    expect(UNIT_COUNT).toBe(11);
  });

  it('issues five s6 calls, one per category id, and one call for every other section', async () => {
    const keys: Array<[AiSectionId, string | null]> = [];
    mockSections((id, key) => {
      keys.push([id, key]);
      return key === null ? good(id) : goodUnit(id, key);
    });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(keys.filter(([id]) => id === 's6').map(([, k]) => k)).toEqual(S6_UNIT_IDS);
    for (const id of AI_SECTION_IDS) {
      if (id === 's6') continue;
      expect(keys.filter(([i]) => i === id), id).toEqual([[id, null]]);
    }
    expect(r.section_sources.s6).toBe('ai');
  });

  it('retries a failing unit ALONE — the other four are not re-called', async () => {
    const target = S6_UNIT_IDS[2]!;
    const perKey = new Map<string, number>();
    mockSections((id, key) => {
      if (id !== 's6') return good(id);
      const n = (perKey.get(key!) ?? 0) + 1;
      perKey.set(key!, n);
      return key === target && n === 1 ? null : goodUnit(id, key!);
    });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(perKey.get(target)).toBe(2);
    for (const k of S6_UNIT_IDS) if (k !== target) expect(perKey.get(k), k).toBe(1);
    expect(r.section_sources.s6).toBe('ai'); // the retry carried it
  });

  it('falls back ENTIRELY when one unit fails both rounds (all-or-nothing, design §3.7)', async () => {
    const target = S6_UNIT_IDS[1]!;
    mockSections((id, key) => {
      if (id !== 's6') return good(id);
      return key === target ? null : goodUnit(id, key!);
    });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(r.section_sources.s6).toBe('fallback');
    expect(r.sections.s6).toBeUndefined();          // no 4-of-5 partial is persisted
    expect(r.section_sources.s2).toBe('ai');        // the rest of the report still ships
  });

  it('merges five passing units into one S6Schema section, in slice order', async () => {
    mockAllSectionsGood();
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(r.section_sources.s6).toBe('ai');
    const merged = SECTION_REGISTRY.s6.schema.safeParse(r.sections.s6);
    expect(merged.success).toBe(true);
    expect((merged.data as { areas: { category_id: string }[] }).areas.map((a) => a.category_id))
      .toEqual(S6_UNIT_IDS);
  });

  it("names ONE id in a unit's category-coverage corrective, never all five", async () => {
    const target = S6_UNIT_IDS[3]!;
    const correctives: Array<[string | null, string | null]> = [];
    const perKey = new Map<string, number>();
    mockComposeSection.mockImplementation(
      async (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's6') return good(id);
        const n = (perKey.get(unitKey!) ?? 0) + 1;
        perKey.set(unitKey!, n);
        correctives.push([unitKey!, corrective ?? null]);
        // Round 1 for the target returns a SIBLING's area: known to the section, unknown to this
        // unit. That is a genuine `category coverage` rejection under the unit gate.
        return unitKey === target && n === 1
          ? goodUnit('s6', S6_UNIT_IDS[0]!)
          : goodUnit('s6', unitKey!);
      },
    );
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    const retry = correctives.find(([k, c], i) => k === target && i > 0 && c !== null)![1]!;
    expect(retry).toContain(target);
    for (const k of S6_UNIT_IDS) if (k !== target) expect(retry, k).not.toContain(k);
    expect(r.section_sources.s6).toBe('ai');
  });

  it('states the UNIT ceiling in a unit length corrective, never the section ceiling', async () => {
    const target = S6_UNIT_IDS[0]!;
    const perKey = new Map<string, number>();
    const correctives: string[] = [];
    mockComposeSection.mockImplementation(
      async (id: AiSectionId, _f: unknown, _m: unknown, corrective?: string | null, unitKey?: string) => {
        if (id !== 's6') return good(id);
        const n = (perKey.get(unitKey!) ?? 0) + 1;
        perKey.set(unitKey!, n);
        if (corrective) correctives.push(corrective);
        if (unitKey !== target || n > 1) return goodUnit('s6', unitKey!);
        const u = goodUnit('s6', target) as { areas: Array<{ affirm: string }> };
        // Digit-free padding, so gate 2 stays clear and gate 6 is the failure that fires.
        return { areas: u.areas.map((a) => ({ ...a, affirm: `${a.affirm} ${'x '.repeat(1200)}` })) };
      },
    );
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    const lengthCorrective = correctives.find((c) => c.toLowerCase().includes('shorter'))!;
    expect(lengthCorrective).toContain('1200');   // the unit ceiling...
    expect(lengthCorrective).toContain('171');    // ...and wordBudget(1200)
    expect(lengthCorrective).not.toContain('6000');
    expect(lengthCorrective).not.toContain('857');
  });

  it('falls back rather than persisting an empty section when a fanned slice has no units', async () => {
    // Fail-closed guard. With zero units, `every unit succeeded` is vacuously true and merge([])
    // yields `{ areas: [] }` — which S6Schema accepts, so it would persist and render nothing
    // while reading as 'ai'. Gate 1b's `empty` check never runs, because no call is made.
    const threeCat = buildFacts({
      ...baseArgs,
      diagnosis: makeDiagnosis({ categories: CAT_IDS.slice(0, 3).map((id, i) => makeCategory(id, [72, 68, 66][i]!)) }),
    });
    mockAllSectionsGood();
    const r = await composeReport({ facts: threeCat, methodology, labels: [] });
    expect(r.section_sources.s6).toBe('fallback');
    expect(r.sections.s6).toBeUndefined();
  });
});

describe('assembleReport', () => {
  const live = 'h'.repeat(64);

  it('renders a persisted section when the hash matches', () => {
    const persisted = { inputs_hash: live, sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('ai');
  });

  it('falls back when the hash is stale', () => {
    const persisted = { inputs_hash: 'x'.repeat(64), sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('fallback');
  });

  it('falls back when there is no persisted row at all', () => {
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted: null, liveInputsHash: live });
    for (const s of out) expect(s.source, s.id).toBe('fallback');
  });

  it('falls back rather than crashing on a malformed persisted section', () => {
    // A reports row outlives the code that wrote it and `sections` is untyped jsonb, so each
    // persisted section is re-parsed against its CURRENT schema at render.
    const persisted = { inputs_hash: live, sections: { s2: { summary: 42 } } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('fallback');
  });

  it('returns a complete report from a partial persisted row', () => {
    const persisted = { inputs_hash: live, sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out).toHaveLength(12);
    for (const s of out) expect(s.fallback.body.trim().length, s.id).toBeGreaterThan(0);
    expect(out.filter((s) => s.source === 'ai')).toHaveLength(1);
  });

  it('never reads the persisted facts blob', () => {
    // C5 + CT-2(c): facts is write-only provenance. Rendering from it would stop every surface
    // re-deriving the diagnosis from responses per request.
    const src = readFileSync('lib/report/compose.ts', 'utf8');
    expect(src).not.toMatch(/persisted\s*\.\s*facts/);
    expect(src).not.toMatch(/\bfacts\b\s*:\s*persisted/);
  });
});

describe('isUsableCachedReport (I9)', () => {
  it('is a hit when at least one section came from the model', () => {
    expect(isUsableCachedReport({ s2: 'ai', s4: 'fallback' })).toBe(true);
    expect(isUsableCachedReport(['fallback', 'ai'])).toBe(true);
  });

  it('is a MISS when every section fell back', () => {
    expect(isUsableCachedReport({ s2: 'fallback', s4: 'fallback' })).toBe(false);
    expect(isUsableCachedReport(['fallback', 'fallback'])).toBe(false);
  });

  it('is a MISS for a malformed or absent value', () => {
    expect(isUsableCachedReport(null)).toBe(false);
    expect(isUsableCachedReport(undefined)).toBe(false);
    expect(isUsableCachedReport('ai')).toBe(false);
  });
});

describe('chart models on AssembledSection', () => {
  // Reuses the module-level `methodology` (loadMethodology(), declared above at :31) rather
  // than redeclaring it here — task-5-brief.md's snippet shadowed it locally, but the outer
  // const is the same value and there is no reason to load the methodology twice in one file.

  it('gives s3 the verdict block then the stat grid, in that order', () => {
    const charts = chartsForSection('s3', CAPACITY_FACTS, methodology);
    expect(charts.map((c) => c.kind)).toEqual(['verdict_block', 'stat_grid']);
  });

  it('gives s7 the rank-list chart', () => {
    expect(chartsForSection('s7', CAPACITY_FACTS, methodology).map((c) => c.kind)).toEqual(['rank_list']);
  });

  it('gives s7 no chart when there are no bottom items', () => {
    const empty = makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } });
    expect(chartsForSection('s7', empty, methodology)).toEqual([]);
  });

  it('gives every other section no charts', () => {
    for (const id of ['s1', 's2', 's4', 's5', 's6', 's8', 's9', 's10', 's11', 's12'] as const) {
      expect(chartsForSection(id, CAPACITY_FACTS, methodology), id).toEqual([]);
    }
  });

  it('attaches charts on the fallback-only path too — the share page is permanently fallback', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sections = assembleFallbackOnly({ facts, methodology, reflections: [] });
      const s3 = sections.find((s) => s.id === 's3')!;
      expect(s3.source, name).toBe('fallback');
      expect(s3.charts.map((c) => c.kind), name).toEqual(['verdict_block', 'stat_grid']);
    }
  });

  it('attaches identical charts whether the section is ai or fallback', () => {
    const viaAssemble = assembleReport({
      facts: CAPACITY_FACTS, methodology, reflections: [], persisted: null, liveInputsHash: 'x',
    });
    const viaFallbackOnly = assembleFallbackOnly({ facts: CAPACITY_FACTS, methodology, reflections: [] });
    for (const id of ['s3', 's7'] as const) {
      expect(viaAssemble.find((s) => s.id === id)!.charts)
        .toEqual(viaFallbackOnly.find((s) => s.id === id)!.charts);
    }
  });
});
