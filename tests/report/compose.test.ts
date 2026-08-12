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
import { composeReport, assembleReport } from '../../lib/report/compose';
import { AI_SECTION_IDS, type AiSectionId } from '../../lib/ai/sections';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '../../lib/report/facts';

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
      return {
        areas: [{
          category_id: 'conn',
          affirm: 'Community / Connection has real strengths worth naming.',
          pivot: 'At 30 out of 100 it is the one area holding the rest of the chain back.',
          evidence: 'The connection pathway from guest to committed member is inconsistent.',
          not_statement: 'This is not a judgment on the team running it.',
          reframe: 'Overall health still sits at 70 out of 100, so this is one fixable link, not a collapse.',
          trajectory: 'Addressing it first unlocks the stages downstream.',
        }],
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
function gateFailingSix() {
  const s6 = good('s6') as { areas: Array<{ trajectory: string }> };
  return { ...s6, areas: [{ ...s6.areas[0]!, trajectory: s6.areas[0]!.trajectory + ' Growth is up 37 percent.' }] };
}

function mockSections(fn: (id: AiSectionId) => unknown) {
  mockComposeSection.mockImplementation(async (id: AiSectionId) => fn(id));
}
function mockAllSectionsGood() {
  mockSections((id) => good(id));
}
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
    for (const id of ['s1', 's3', 's8', 's10', 's11', 'appendix'] as const) {
      expect(r.section_sources[id], id).toBe('fallback');
    }
  });

  it('re-attempts only the failed sections, exactly once', async () => {
    const calls: string[] = [];
    mockSections((id) => {
      calls.push(id);
      return id === 's6' && calls.filter((c) => c === 's6').length === 1 ? null : good(id);
    });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(calls.filter((c) => c === 's6')).toHaveLength(2); // one re-attempt
    expect(calls.filter((c) => c === 's2')).toHaveLength(1); // untouched
    expect(r.section_sources.s6).toBe('ai');
  });

  it('re-attempts a gate failure as well as a call failure', async () => {
    // The model is nondeterministic, so a re-roll is a genuine fix, not a hope (C2).
    let n = 0;
    mockSections((id) => (id === 's2' ? (++n === 1 ? gateFailingS2() : good('s2')) : good(id)));
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(n).toBe(2);
    expect(r.section_sources.s2).toBe('ai');
  });

  it('gives up after the single re-attempt and persists a partial report', async () => {
    mockSections((id) => (id === 's6' ? null : good(id)));
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
    mockSections((id) => (id === 's6' ? gateFailingSix() : good(id)));
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    const joined = warn.mock.calls.flat().join(' ');
    // R9: assert the distinguishing <reason> text, not just the shared "[report] section s6:"
    // prefix — a prior task shipped an untested branch exactly that way, when two different
    // failure modes shared the same prefix. The invented "37 percent" trips gate 2 (numeric
    // containment), not gate 1 (field parity) — assert both the reason that DID fire and a
    // negative assertion for a plausible reason that did NOT, so a fall-through is detectable.
    expect(joined).toContain('[report] section s6: numeric containment');
    expect(joined).not.toContain('field parity');
    warn.mockRestore();
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
    expect(out).toHaveLength(13);
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
