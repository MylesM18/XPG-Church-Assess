import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { CategoryState, Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type CategoryFact, type ChurchFacts, type FactsPack } from '../../lib/report/facts';

// vi.hoisted so `mockParse` exists before the hoisted vi.mock factory runs.
// Idiom copied verbatim from tests/ai/themes-generate.test.ts:5-13 / tests/ai/prose-generate.test.ts:7-17
// — do not invent a new one. `mockParse` is a vi.fn(); per-test configuration happens via
// `mockParse.mockResolvedValue(...)` / `mockParse.mockRejectedValue(...)`, never by calling it directly.
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(() => ({ responses: { parse: mockParse } })),
}));
vi.mock('openai/helpers/zod', () => ({
  zodTextFormat: vi.fn(() => ({ type: 'json_schema' })),
}));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { AI_SECTION_IDS, SECTION_REGISTRY, composeSection, FAN_OUT, S6Schema, type AiSectionId } from '../../lib/ai/sections';
import type { SectionId } from '../../lib/methodology/schema';

const methodology = loadMethodology();

// capacityFacts is NOT an importable fixture anywhere in the repo (task-6-recon.md divergence
// #2 / controller ruling B) — built inline here, a third copy of the makeCategory/makeDiagnosis/
// CHURCH/RESPONSES pattern already duplicated in tests/report/facts.test.ts and
// tests/report/fallback-sections.test.ts:14-104. Trimmed to just the single capacity-archetype
// FactsPack this file needs — no constraint/foundation variants required here.

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
    state: 'ok' as CategoryState,
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

// capacity archetype (archetypeFor: no primary_constraint, no gating_conditions).
const capacityFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
});

describe('the section registry', () => {
  it('covers exactly the seven AI sections', () => {
    expect([...AI_SECTION_IDS]).toEqual(['s2', 's4', 's5', 's6', 's7', 's9', 's12']);
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...AI_SECTION_IDS].sort());
  });

  it('gives S6 the larger budget and everything else 4000', () => {
    expect(SECTION_REGISTRY.s6.maxOutputTokens).toBe(8000);
    for (const id of AI_SECTION_IDS) {
      if (id !== 's6') expect(SECTION_REGISTRY[id].maxOutputTokens, id).toBe(4000);
    }
  });

  it('ties AiSectionId to SectionId at compile time (ruling E)', () => {
    // SectionId (lib/methodology/schema.ts) is a literal union of all 13 section keys.
    // AiSectionId must be a subset of it — this assignment only typechecks if every
    // AiSectionId member is also a SectionId member. A rename in the schema that drops one
    // of these seven literals from SectionId breaks this line at tsc time, not just here:
    // it also breaks the SECTION_REGISTRY object literal in lib/ai/sections.ts (excess
    // property / missing property errors), since AiSectionId is Extract<SectionId, ...>.
    const _check: SectionId = AI_SECTION_IDS[0] as AiSectionId;
    void _check;
    expect(AI_SECTION_IDS.length).toBe(7);
  });
});

describe('facts slices', () => {
  beforeEach(() => { mockParse.mockReset(); });

  // Fix round A (I5): asserted against the REAL serialized `client.responses.parse` call
  // argument (house idiom: tests/ai/themes-generate.test.ts's `JSON.stringify(mockParse.mock
  // .calls[0]![0])` pattern), not against `sectionSlice` — that helper has no production caller
  // (`composeSection` calls `entry.slice(facts)` directly when it builds the `input[1]` user
  // message) and so cannot observe what actually goes over the wire. Stringifying the whole first
  // argument, not just `input[1].content`, also catches a leak smuggled into the system message.

  it('never sends a verbatim over the wire for any AI section', async () => {
    // Parent spec line 72: verbatims flow facts → the S8 renderer exclusively. S8 is not an AI
    // section at all, so no section's wire payload has any business holding one.
    const facts = { ...capacityFacts, themes: [{ label: 'L', gloss: 'g', support_count: 4, item_ids: ['conn_2'], verbatims: ['SENTINEL QUOTE'] }] };
    for (const id of AI_SECTION_IDS) {
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection(id, facts, methodology);
      const call = mockParse.mock.calls[0]![0];
      const payload = JSON.stringify(call);
      expect(payload, id).not.toContain('SENTINEL QUOTE');
      // Non-vacuity: `overall` is in every slice's head(), so a call that never happened or that
      // sent an empty body cannot satisfy this. Scoped to the USER message and pinned to the
      // rendered key — a bare `String(capacity)` against the whole stringified call is fail-open,
      // since a two-digit capacity also matches inside `"max_output_tokens":4000`.
      expect(String(call.input[1].content), id).toContain(`"capacity": ${facts.overall.capacity}`);
    }
  });

  it('never sends a profile field over the wire for a section that has no use for it', async () => {
    const facts = { ...capacityFacts, profile: { consultant_notes: 'SENTINEL NOTE' } };
    for (const id of AI_SECTION_IDS) {
      if (id === 's2') continue; // S2 is the one section that renders profile context
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection(id, facts, methodology);
      const call = mockParse.mock.calls[0]![0];
      const payload = JSON.stringify(call);
      expect(payload, id).not.toContain('SENTINEL NOTE');
      // Non-vacuity scoped to the USER message, for the reason given in the test above.
      expect(String(call.input[1].content), id).toContain(`"capacity": ${facts.overall.capacity}`);
    }
  });
});

describe('composeSection', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('returns null and logs a reason when the response is incomplete', async () => {
    // Fix round 1: a prefix-only assertion (`[report] section s2:`) cannot distinguish this
    // branch from the null-parsed branch below, since both share that prefix — the reviewer
    // proved this by disabling the `status === 'incomplete'` check entirely (it fell through
    // to the null-parsed branch, which logs the same prefix) and all tests still passed. The
    // `<reason>` half of the `[report] section <id>: <reason>` contract is what distinguishes
    // "the budget ran out" from "no parsed output" — assert the reason text this
    // implementation actually emits (lib/ai/sections.ts's `response incomplete (...)` string),
    // not just the shared prefix.
    mockParse.mockResolvedValue({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await composeSection('s2', capacityFacts, methodology)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[report] section s2: response incomplete (max_output_tokens)'));
    warn.mockRestore();
  });

  it('returns null and logs a reason when there is no parsed output', async () => {
    // Fix round 1: asserts its own distinct reason text ("model returned no parsed output"),
    // never "response incomplete" — so this test and the one above cannot both pass on the
    // same code path (e.g. the incomplete branch deleted and everything falling through here).
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await composeSection('s4', capacityFacts, methodology)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[report] section s4: model returned no parsed output'));
    expect(warn.mock.calls.flat().join(' ')).not.toContain('response incomplete');
    warn.mockRestore();
  });

  it('returns null rather than throwing when the request fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(composeSection('s9', capacityFacts, methodology)).resolves.toBeNull();
    warn.mockRestore();
  });

  it('logs no payload, section text or church data on any failure path', async () => {
    mockParse.mockRejectedValue(new Error('secret-church-name leaked in the message'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await composeSection('s2', capacityFacts, methodology);
    // Reason strings only: the SDK's own message is passed through, but nothing from the pack.
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(capacityFacts.cover.church_name);
    warn.mockRestore();
  });

  it('returns the parsed object on success', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: { summary: 's', what_this_is_not: 'n', context_bullets: [] } });
    expect(await composeSection('s2', capacityFacts, methodology)).toEqual({ summary: 's', what_this_is_not: 'n', context_bullets: [] });
  });

  // The budget.test.ts unit tests prove the arithmetic; these two prove the WIRING — that the
  // sentence reaches the model, and that it is derived per section rather than once globally.
  // The plan's sketch used a `constraintFacts` fixture that does not exist in this file (see
  // line 24: only the capacity archetype was built here). budgetSentence reads
  // `copy.length_ceiling`, never the archetype, so capacityFacts proves the same thing.
  it('sends the length budget in the system prompt (spec §4.2)', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    await composeSection('s12', capacityFacts, methodology);
    const call = mockParse.mock.calls[0]![0];
    const system = call.input.filter((m: { role: string }) => m.role === 'system')
      .map((m: { content: string }) => m.content).join('\n');
    expect(system).toContain('128 words');                    // s12's ceiling is 900
    expect(system).toContain(methodology.report.style_spine); // the spine is still there
  });

  it('derives the budget per section, not once globally', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    await composeSection('s2', capacityFacts, methodology);
    const call = mockParse.mock.calls[0]![0];
    const system = call.input.filter((m: { role: string }) => m.role === 'system')
      .map((m: { content: string }) => m.content).join('\n');
    expect(system).toContain('200 words');  // s2's ceiling is 1400
    expect(system).not.toContain('128 words');
  });

  // The request OPTIONS, not the request body — `mockParse.mock.calls[0]![1]` is the same house
  // idiom as the `[0]` assertions above, one argument over. Both numbers were sized against
  // measured per-call latency in docs/superpowers/plans/2026-08-17-2a-measurements.md
  // ("### The three numbers, derived"); this pins them so a later edit cannot quietly shrink the
  // budget back under the slowest well-formed call.
  it('asks the SDK for the measured per-attempt timeout and retry budget (spec §4.5)', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    await composeSection('s6', capacityFacts, methodology);
    expect(mockParse.mock.calls[0]![1]).toEqual({ timeout: 45_000, maxRetries: 1 });
  });

  // The unit wiring. tests/report/compose.test.ts mocks composeSection wholesale, so it observes
  // only the ARGUMENT passed — never the payload that went over the wire. This is the only place
  // the unit slice and the unit budget are proven to reach the model.
  const systemOf = () =>
    (mockParse.mock.calls[0]![0].input as Array<{ role: string; content: string }>)
      .filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const userOf = () =>
    (mockParse.mock.calls[0]![0].input as Array<{ role: string; content: string }>)
      .filter((m) => m.role === 'user').map((m) => m.content).join('\n');

  it('sends only the named category when given a unit key', async () => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    const ids = FAN_OUT.s6!.keys(capacityFacts);
    await composeSection('s6', capacityFacts, methodology, null, ids[0]!);
    const payload = JSON.parse(userOf().slice(userOf().indexOf('{'))) as { categories: { id: string }[] };
    expect(payload.categories.map((c) => c.id)).toEqual([ids[0]!]);
  });

  it('states the unit budget, not the section budget, on a unit call', async () => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    const ids = FAN_OUT.s6!.keys(capacityFacts);
    await composeSection('s6', capacityFacts, methodology, null, ids[0]!);
    expect(systemOf()).toContain('171 words');       // wordBudget(unitCeiling(6000, 5))
    expect(systemOf()).not.toContain('857 words');   // never the whole section's
  });

  // E1. Delete this test with the `beats` field if E1 resolves as alternative (a).
  it('states the budget per beat as well as per unit (design §3.5)', async () => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    const ids = FAN_OUT.s6!.keys(capacityFacts);
    await composeSection('s6', capacityFacts, methodology, null, ids[0]!);
    expect(systemOf()).toContain('28 words per field'); // floor(171 / 6)
  });

  // The negative control, and the reason `unitKey` is optional.
  it('sends the whole five-category slice and the section budget with no unit key', async () => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
    await composeSection('s6', capacityFacts, methodology);
    const payload = JSON.parse(userOf().slice(userOf().indexOf('{'))) as { categories: { id: string }[] };
    expect(payload.categories).toHaveLength(5);
    expect(systemOf()).toContain('857 words');
    expect(systemOf()).not.toContain('per field');
  });
});

// D1. Nothing in the suite proved the corrective ever reached the model: deleting the
// `...(corrective ? [...] : [])` spread at sections.ts:183 left EVERY test green. All ten other
// `composeSection(` calls in this file are 3-arity, and tests/report/compose.test.ts mocks
// composeSection wholesale, so it observes only the ARGUMENT that was passed, never the payload
// that went over the wire. This block is the branch's headline claim.
//
// Asserted by POSITION, not presence. `expect(payload).toContain(SENTINEL)` also passes when the
// correction is concatenated onto the style-spine system message, or appended after the facts —
// both change what the model is being asked, and neither is what spec §4.3 specifies. The
// contract is exactly three messages, in order: spine, correction, facts.
describe('composeSection — the corrective on the wire (spec §4.3, D1)', () => {
  const SENTINEL = 'CORRECTIVE SENTINEL';
  const inputOf = () =>
    mockParse.mock.calls[0]![0].input as Array<{ role: string; content: string }>;

  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
  });

  it('inserts the corrective as its own system message between the spine and the facts', async () => {
    await composeSection('s2', capacityFacts, methodology, SENTINEL);
    const input = inputOf();
    expect(input).toHaveLength(3);
    expect(input[1]!.role).toBe('system');
    expect(input[1]!.content).toBe(SENTINEL);
    // The bookends, so "three messages, one of which is the sentinel" cannot be satisfied by a
    // duplicated spine, nor by the correction displacing the facts the gate constrains against.
    expect(input[0]!.role).toBe('system');
    expect(input[0]!.content).toContain(methodology.report.style_spine);
    expect(input[2]!.role).toBe('user');
    expect(input[2]!.content).toContain(`"capacity": ${capacityFacts.overall.capacity}`);
  });

  it('sends two messages, and no corrective, when none is given', async () => {
    await composeSection('s2', capacityFacts, methodology);
    const input = inputOf();
    expect(input).toHaveLength(2);
    expect(input[0]!.role).toBe('system');
    expect(input[1]!.role).toBe('user');
    expect(JSON.stringify(input)).not.toContain(SENTINEL);
  });

  // correctiveInstruction returns null for anonymity, field parity and pattern claim, and
  // compose.ts passes null straight through when the call itself failed. A blind re-roll must
  // produce the SAME two-message payload as a first attempt — never a third message holding
  // "null" or an empty string, which would read to the model as a blank instruction.
  it('sends two messages for a null or empty corrective — the blind re-roll', async () => {
    for (const corrective of [null, ''] as const) {
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection('s2', capacityFacts, methodology, corrective);
      const input = inputOf();
      expect(input, JSON.stringify(corrective)).toHaveLength(2);
      expect(input[1]!.role, JSON.stringify(corrective)).toBe('user');
    }
  });

  it('carries the corrective for every AI section, not just the one measured', async () => {
    for (const id of AI_SECTION_IDS) {
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection(id, capacityFacts, methodology, SENTINEL);
      const input = inputOf();
      expect(input, id).toHaveLength(3);
      expect(input[1]!.content, id).toBe(SENTINEL);
    }
  });
});

describe('FAN_OUT (spec §3.1-§3.3)', () => {
  const s6Ids = (SECTION_REGISTRY.s6.slice(capacityFacts) as { categories: CategoryFact[] })
    .categories.map((c) => c.id);

  // Non-vacuity FIRST, asserted on the fixture rather than on the code under test: without it
  // every expectation below is satisfiable by an empty `keys` paired with empty expectations.
  it('has a non-empty five-id slice to assert against', () => {
    expect(s6Ids.length).toBe(5);
    expect(new Set(s6Ids).size).toBe(5);
  });

  it('opts in s6 and nothing else', () => {
    expect(Object.keys(FAN_OUT)).toEqual(['s6']);
    for (const id of AI_SECTION_IDS) if (id !== 's6') expect(FAN_OUT[id], id).toBeUndefined();
  });

  // Read off the SECTION slice, never by re-deriving `.slice(3)` here — the same discipline
  // sliceCategoryIds and gate 1b already follow.
  it('reads its keys off the section slice, in slice order', () => {
    expect(FAN_OUT.s6!.keys(capacityFacts)).toEqual(s6Ids);
  });

  it('narrows ONLY categories and leaves every other slice field deep-equal', () => {
    const base = SECTION_REGISTRY.s6.slice(capacityFacts) as Record<string, unknown>;
    const unit = FAN_OUT.s6!.slice(capacityFacts, s6Ids[1]!) as Record<string, unknown>;
    expect((unit.categories as CategoryFact[]).map((c) => c.id)).toEqual([s6Ids[1]!]);
    // Occurrence-for-occurrence over the OTHER keys: a slice that quietly dropped
    // blind_spots/top_three/bottom_items would still pass a categories-only assertion.
    expect(Object.keys(unit).sort()).toEqual(Object.keys(base).sort());
    for (const k of Object.keys(base)) {
      if (k === 'categories') continue;
      expect(unit[k], k).toEqual(base[k]);
    }
  });

  // Fails CLOSED (spec §3.2): a key matching nothing yields an empty categories array, so gate
  // 1b's known set is empty and any returned entry fails `unknown:`.
  it('yields an empty category list for a key that matches nothing', () => {
    const unit = FAN_OUT.s6!.slice(capacityFacts, 'no-such-category') as { categories: CategoryFact[] };
    expect(unit.categories).toEqual([]);
  });

  it('merges units back into the persisted shape, in key order, and round-trips S6Schema', () => {
    const area = (id: string) => ({
      category_id: id, affirm: 'a', pivot: 'p', evidence: 'e',
      not_statement: 'n', reframe: 'r', trajectory: 't',
    });
    const merged = FAN_OUT.s6!.merge(s6Ids.map((id) => ({ areas: [area(id)] })));
    expect(S6Schema.safeParse(merged).success).toBe(true);
    expect((merged as { areas: { category_id: string }[] }).areas.map((a) => a.category_id))
      .toEqual(s6Ids);
  });

  // E1. Delete this test and the `beats` field together if E1 resolves as alternative (a).
  it('declares the per-unit beat count S6Schema actually carries', () => {
    const beatFields = Object.keys(S6Schema.shape.areas.element.shape)
      .filter((k) => k !== 'category_id');
    expect(beatFields).toHaveLength(6);
    expect(FAN_OUT.s6!.beats).toBe(beatFields.length);
  });
});
