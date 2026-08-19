import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { diagnose } from '@/lib/engine';
import { responseHash } from '@/lib/report/response-hash';
import { reportInputsHash } from '@/lib/report/report-hash';
import { buildFacts, type ChurchFacts } from '@/lib/report/facts';
import { knownLabels } from '@/lib/report/anonymity';
import type { Response } from '@/lib/engine/types';

/**
 * R5/R6 — the carry-forward. tests/report/generate-report-wiring.test.ts pins the SHAPE of the
 * new block via source-text assertions; this file proves its BEHAVIOR by actually executing
 * generateDiagnosis against a fully faked, PostgREST-shaped Supabase client, following the exact
 * precedent tests/ai/prose-cache-scope.test.ts already establishes (import the real function,
 * mock @/lib/supabase/server + next/cache + next/navigation, vi.stubEnv PROSE_MODE). No new
 * infrastructure — @/lib/ai/themes and @/lib/report/compose are additionally mocked with the
 * same vi.hoisted idiom so no real OpenAI call is ever reachable.
 *
 * Global Constraint (plan L19): "AI is off" logs nothing under `[report]`; "AI is broken" logs
 * `[report] section <id>: <reason>`. That distinction is a TESTED invariant — the "AI is broken"
 * half is already covered at composeSection granularity by tests/ai/sections.test.ts; the
 * "[report]-silent" half had zero coverage anywhere in the repo before this file.
 *
 * Since fix/prose-auto-generate-on-view "AI is off" means `proseEnabled()` is false
 * (lib/ai/prose-mode.ts): PROSE_MODE=fallback, or PROSE_MODE unset AND OPENAI_API_KEY absent —
 * key-present now turns AI ON. The one permitted off-log is that helper's single
 * `[prose-mode] AI prose disabled: …` reason line, tagged `[prose-mode]` precisely so the
 * `[report]`-silence invariant below stays exact. The "off" case therefore deletes BOTH env vars.
 */

const { mockCreateClient, mockGenerateProse, mockClusterThemes, mockComposeReport } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGenerateProse: vi.fn(),
  mockClusterThemes: vi.fn(),
  mockComposeReport: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }));
vi.mock('@/lib/ai/prose', () => ({ generateProse: mockGenerateProse }));
vi.mock('@/lib/ai/themes', () => ({ clusterThemes: mockClusterThemes }));
// Task 3 (I9): actions.ts now also imports isUsableCachedReport from this module, and calls it
// for real inside the cache-check block below. A bare `{ composeReport: mockComposeReport }`
// replacement (no importOriginal) would drop that export, so the cache-hit test below would hit
// `isUsableCachedReport is not a function` — caught by generateDiagnosis's own try/catch and
// silently swallowed, which would make the assertions pass for the wrong reason (a masked
// exception, not a genuine cache-hit computation). importOriginal keeps isUsableCachedReport (and
// assembleReport) real, mirroring tests/report/compose.test.ts's identical precedent for
// @/lib/ai/sections.
vi.mock('@/lib/report/compose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/report/compose')>();
  return { ...actual, composeReport: mockComposeReport };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { generateDiagnosis } from '@/app/app/[churchId]/actions';

const m = loadMethodology();
const CHURCH_A = '11111111-1111-1111-1111-111111111111';

const responses: Response[] = m.questions.categories.flatMap((c) =>
  c.items.map((it) => ({ category_id: c.id, item_id: it.id, value: 7, respondent_label: 'Pastor', respondent_id: 'Pastor' })),
);
const DIAGNOSIS = diagnose(responses, m, { attendance_band: '500_999' });
const HASH = responseHash(responses, DIAGNOSIS.methodology_version);

// Raw get_run_responses rows: reflection: null for every row, matching how prose-cache-scope
// keeps `responses` and `raw` congruent. reflectionRows therefore comes out empty in every test
// below — irrelevant to what's under test here, since clusterThemes itself is mocked and its
// return value (not its input) is what each fixture controls.
const RAW_ROWS = responses.map((r) => ({
  category_id: r.category_id,
  item_id: r.item_id,
  value: r.value,
  respondent_label: r.respondent_label,
  respondent_user_id: null as string | null,
  reflection: null as string | null,
}));

const CHURCH_FACTS: ChurchFacts = {
  name: '', denomination: null, context: null, attendance_band: '500_999',
  adults_band: null, staff_fte_band: null, budget_band: null, church_age_band: null,
  growth_trajectory: null, campuses_band: null, facility_status: null,
  leadership_history: null, consultant_notes: null,
};
// Mirrors the `churches` fixture row `{ id: CHURCH_A, attendance_band: '500_999' }` used below,
// field-for-field, exactly as actions.ts's `?? null` / `?? ''` widened-select mapping would.

const LABEL_SOURCE = knownLabels(responses);
const BASE_FACTS_FOR_HASH = buildFacts({
  diagnosis: DIAGNOSIS,
  methodology: m,
  responses,
  church: CHURCH_FACTS,
  completedAt: null, // completedAt is not a reportInputsHash input — see lib/report/report-hash.ts
  labelSource: LABEL_SOURCE,
});
// The real cache key generateDiagnosis will compute for a run resolved on the CURRENT
// methodology edition (methodology_version === m.questions.version), so the "cache hit" fixture
// below is a genuinely computed key, never a hardcoded digest (per ruling R6).
const REPORT_INPUTS_HASH = reportInputsHash({
  methodologyVersion: DIAGNOSIS.methodology_version,
  responseHash: HASH,
  methodology: m,
  reflections: [],
  profile: BASE_FACTS_FOR_HASH.profile,
  reportVersion: m.report.version,
});

const RUN_A_ROW = { id: 'run-a', church_id: CHURCH_A, status: 'complete', created_at: '2026-01-01', methodology_version: m.questions.version };

type Row = Record<string, unknown>;

/** Identical minimal PostgREST-shaped fake to tests/ai/prose-cache-scope.test.ts. */
function fakeDb(tables: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let sortKey: string | null = null;
    let cap: number | null = null;

    const rows = () => {
      let out = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      if (sortKey) out = [...out].sort((a, b) => String(a[sortKey!]).localeCompare(String(b[sortKey!])));
      if (cap !== null) out = out.slice(0, cap);
      return out;
    };

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push([col, val]); return api; },
      order: (col: string) => { sortKey = col; return api; },
      limit: (n: number) => { cap = n; return api; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
    };
    return api;
  }
  return builder;
}

/** Wires a fake Supabase client for one call to generateDiagnosis and records every rpc call. */
function setupSupabase(opts: { runRow: Row | null; reportsRows?: Row[]; rpcThrows?: Set<string> }) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const from = fakeDb({
    // Task 2 (plan 4): generateDiagnosis now reads this row via loadChurchProfile's named-column
    // select (lib/data/churches.ts), then maps it through churchFactsFrom (lib/report/inputs-hash.ts),
    // which rest-spreads the row as-is rather than independently defaulting each column to null the
    // way the old inline mapping did. A real Postgres/PostgREST response to a named-column select
    // always returns every requested column (null, never omitted) — so this fixture must mirror that
    // shape (full row, explicit nulls) to stay realistic. All fields null except attendance_band,
    // matching CHURCH_FACTS above field-for-field.
    churches: [{
      id: CHURCH_A,
      name: null,
      denomination: null,
      context: null,
      attendance_band: '500_999',
      adults_band: null,
      staff_fte_band: null,
      budget_band: null,
      church_age_band: null,
      growth_trajectory: null,
      campuses_band: null,
      facility_status: null,
      leadership_history: null,
      consultant_notes: null,
    }],
    assessment_runs: opts.runRow ? [opts.runRow] : [],
    diagnoses: [],
    reports: opts.reportsRows ?? [],
  });

  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (opts.rpcThrows?.has(name)) throw new Error(`${name} failed`);
      if (name === 'get_run_responses') return { data: RAW_ROWS, error: null };
      if (name === 'save_diagnosis') return { data: null, error: null };
      if (name === 'save_prose') return { data: null, error: null };
      return { data: null, error: null };
    },
  });

  return { rpcCalls };
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockCreateClient.mockReset();
  mockGenerateProse.mockReset();
  mockGenerateProse.mockResolvedValue(null);
  mockClusterThemes.mockReset();
  mockClusterThemes.mockResolvedValue(null);
  mockComposeReport.mockReset();
  mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

/**
 * Every console.warn/console.log call this test run produced, flattened to strings, filtered to
 * lines that begin `[report]`. Never "the spy was never called at all" (per R5) — unrelated
 * logging elsewhere in the action (e.g. the M5b block's own `[m5b]`-prefixed line) would make a
 * bare never-called assertion brittle, and its passing would prove nothing about this task.
 */
function reportLines(): string[] {
  return [...warnSpy.mock.calls, ...logSpy.mock.calls]
    .map((args) => args.map((a) => String(a)).join(' '))
    .filter((line) => line.startsWith('[report]'));
}

describe('proseEnabled() gate: AI off vs AI on is a tested invariant (R5)', () => {
  it('AI off (PROSE_MODE unset AND OPENAI_API_KEY absent): logs nothing under [report], and never calls clusterThemes, composeReport, or save_report', async () => {
    const hadMode = 'PROSE_MODE' in process.env;
    const prevMode = process.env.PROSE_MODE;
    const hadKey = 'OPENAI_API_KEY' in process.env;
    const prevKey = process.env.OPENAI_API_KEY;
    delete process.env.PROSE_MODE;
    delete process.env.OPENAI_API_KEY;
    // Confirm the ambient values really are unset so this case cannot silently invert — with a
    // key in the dev's shell, proseEnabled() would be TRUE and this would test the ON path.
    expect(process.env.PROSE_MODE).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    try {
      const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW });

      await generateDiagnosis(CHURCH_A);

      expect(reportLines()).toEqual([]);
      expect(mockClusterThemes).not.toHaveBeenCalled();
      expect(mockComposeReport).not.toHaveBeenCalled();
      expect(rpcCalls.some((c) => c.name === 'save_report')).toBe(false);
    } finally {
      if (hadMode) process.env.PROSE_MODE = prevMode;
      else delete process.env.PROSE_MODE;
      if (hadKey) process.env.OPENAI_API_KEY = prevKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it('AI on by KEY ALONE (PROSE_MODE unset, OPENAI_API_KEY set): the report block runs — clusterThemes, composeReport, save_report', async () => {
    // The production configuration PR #79 exists for: a Vercel Production with the key set and no
    // PROSE_MODE. Before that PR this exact case made no model call and logged nothing; the rule
    // "key-present ⇒ on" was pinned only at unit level (tests/ai/prose-mode.test.ts) — this is the
    // end-to-end proof through generateDiagnosis. Regression pin (post-merge review, finding 11).
    const hadMode = 'PROSE_MODE' in process.env;
    const prevMode = process.env.PROSE_MODE;
    delete process.env.PROSE_MODE;
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
    expect(process.env.PROSE_MODE).toBeUndefined();
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    try {
      const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW });

      await generateDiagnosis(CHURCH_A);

      expect(mockClusterThemes).toHaveBeenCalledTimes(1);
      expect(mockComposeReport).toHaveBeenCalledTimes(1);
      expect(rpcCalls.filter((c) => c.name === 'save_report')).toHaveLength(1);
    } finally {
      if (hadMode) process.env.PROSE_MODE = prevMode;
      else delete process.env.PROSE_MODE;
    }
  });

  it('the M5b diagnosis-prose block is retired: generateProse is never called and save_prose never invoked, even with AI on', async () => {
    // fix/auto-generate-hardening (post-merge review of #79, finding 5): flipping the gate to
    // key-present ⇒ on re-enabled the legacy M5b block, which paid one serial gpt-5.1 call per
    // Generate diagnosis to persist `diagnoses.prose` — a column no surface has read since the
    // report redesign (page.tsx and the PDF route select it only for row existence; the share RPC
    // dropped it in migration 20260718000600). `@/lib/ai/prose` stays mocked above precisely so
    // this assertion is meaningful: if actions.ts ever re-imports generateProse, the mock is what
    // it would call.
    vi.stubEnv('PROSE_MODE', 'ai');
    mockGenerateProse.mockResolvedValue({ verdict: 'v', next_step: 'n' });
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    expect(mockGenerateProse).not.toHaveBeenCalled();
    expect(rpcCalls.some((c) => c.name === 'save_prose')).toBe(false);
    // The report block still runs — retiring M5b must not take the live path with it.
    expect(mockComposeReport).toHaveBeenCalledTimes(1);
    expect(rpcCalls.filter((c) => c.name === 'save_report')).toHaveLength(1);
  });

  it('AI on: the call-site gate does not suppress a section-level [report] log line', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockImplementation(async () => {
      // Borrowed, not re-proven: the CONTENT of this reason line is already covered by
      // tests/ai/sections.test.ts. What this case proves is narrower — that the PROSE_MODE gate
      // at the call site lets the call through and does not swallow composeReport's own output.
      // Together with the case above, that is the distinctness the Global Constraint names.
      console.warn('[report] section s2: response incomplete (max_output_tokens)');
      return { sections: {}, section_sources: {} };
    });
    setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    const lines = reportLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[report] section s2: response incomplete (max_output_tokens)');
  });

  it('the catch backstop: a save_report rejection logs exactly one [report] generation failed line, and generateDiagnosis still resolves', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    setupSupabase({ runRow: RUN_A_ROW, rpcThrows: new Set(['save_report']) });

    let threw = false;
    try {
      await generateDiagnosis(CHURCH_A);
    } catch {
      threw = true;
    }
    // The committed diagnosis and the redirect must be unaffected by this backstop firing.
    expect(threw).toBe(false);

    const lines = reportLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[report\] generation failed:/);
  });
});

describe('branch coverage: a null clustering result vs a determinate one (R6)', () => {
  it('themes === null persists facts built WITHOUT themes (the empty default, not a rebuild)', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue(null);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    const call = rpcCalls.find((c) => c.name === 'save_report');
    expect(call).toBeDefined();
    const payload = call!.args.p_payload as { facts: { themes: unknown[] } };
    expect(payload.facts.themes).toEqual([]);
  });

  it('a populated themes array from clusterThemes is rebuilt into facts and persisted as-is', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    const theme = {
      label: 'Volunteer burnout',
      gloss: 'Several respondents flagged volunteer fatigue as a recurring concern.',
      support_count: 3,
      item_ids: [m.questions.categories[0]!.items[0]!.id],
      verbatims: [],
    };
    mockClusterThemes.mockResolvedValue([theme]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    const call = rpcCalls.find((c) => c.name === 'save_report');
    expect(call).toBeDefined();
    const payload = call!.args.p_payload as { facts: { themes: unknown[] } };
    expect(payload.facts.themes).toEqual([theme]);
  });
});

describe('branch coverage: report cache hit vs miss (R6)', () => {
  it('cache miss (no matching reports row): composeReport and save_report are each called exactly once', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    const { rpcCalls } = setupSupabase({ runRow: RUN_A_ROW, reportsRows: [] });

    await generateDiagnosis(CHURCH_A);

    expect(mockComposeReport).toHaveBeenCalledTimes(1);
    expect(rpcCalls.filter((c) => c.name === 'save_report')).toHaveLength(1);
  });

  it('cache hit (matching run_id + inputs_hash): neither clusterThemes, composeReport nor save_report is called', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    // Task 3 (I9): a matching row is only a hit if section_sources shows at least one section
    // came from the model — a row with no section_sources (or all-fallback) is now a MISS by
    // design, so this fixture must carry a genuine 'ai' entry to remain a real cache-hit case.
    const { rpcCalls } = setupSupabase({
      runRow: RUN_A_ROW,
      reportsRows: [{ id: 'report-1', run_id: RUN_A_ROW.id, inputs_hash: REPORT_INPUTS_HASH, section_sources: { s2: 'ai' } }],
    });

    await generateDiagnosis(CHURCH_A);

    expect(mockClusterThemes).not.toHaveBeenCalled();
    expect(mockComposeReport).not.toHaveBeenCalled();
    expect(rpcCalls.some((c) => c.name === 'save_report')).toBe(false);
    // Guards against a false-positive pass: if isUsableCachedReport ever came from a stale mock
    // (e.g. a future edit reverts the vi.mock above to a bare replacement), the cache-check would
    // throw and be swallowed by generateDiagnosis's own catch block, which would ALSO satisfy the
    // three assertions above for the wrong reason — a masked exception, not a genuine hit. This
    // pins that the "not called" outcome above is a real cache-hit decision, not a crash.
    expect(reportLines()).toEqual([]);
  });

  it('a reports row for a DIFFERENT run with the SAME inputs_hash does not suppress generation', async () => {
    // What `.eq('run_id', run.id)` on the cache-check SELECT actually buys, mirroring the M5b
    // prose cache's own scoping rationale a few lines above in actions.ts: an unscoped lookup
    // would let a sibling run's row (same answers -> same inputs_hash, different run) suppress
    // generation for THIS run permanently. Neither the cache-miss nor the cache-hit case above
    // exercises this — both use a `reports` fixture whose run_id already coincides (or is
    // simply absent), so an accidentally-unscoped query would return the identical verdict in
    // both. Only a cross-run collision on the SAME inputs_hash tells them apart.
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    const { rpcCalls } = setupSupabase({
      runRow: RUN_A_ROW,
      reportsRows: [{ id: 'report-sibling', run_id: 'run-sibling', inputs_hash: REPORT_INPUTS_HASH }],
    });

    await generateDiagnosis(CHURCH_A);

    expect(mockComposeReport).toHaveBeenCalledTimes(1);
    expect(rpcCalls.filter((c) => c.name === 'save_report')).toHaveLength(1);
  });
});

describe('branch coverage: run resolvable vs unresolvable (R6)', () => {
  it('run absent: alreadyReported stays false unconditionally — an unresolvable run degrades to a MISS, never a skip', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    // A 'reports' row is seeded (for an unrelated run) precisely to prove it is never even
    // consulted: with `run` unresolved, the `if (run)` guard around the cache-check SELECT
    // never executes, so no pre-existing row of any shape could suppress generation.
    const { rpcCalls } = setupSupabase({
      runRow: null,
      reportsRows: [{ id: 'report-1', run_id: 'unrelated-run', inputs_hash: 'whatever' }],
    });

    await generateDiagnosis(CHURCH_A);

    expect(mockComposeReport).toHaveBeenCalledTimes(1);
    expect(rpcCalls.filter((c) => c.name === 'save_report')).toHaveLength(1);
  });
});

describe('the LabelSource unwrap reaches its two call sites intact (mutation guards)', () => {
  it('clusterThemes receives a LabelSource object as its third argument, never a bare array', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    const labelSourceArg = mockClusterThemes.mock.calls[0]?.[2];
    expect(Array.isArray(labelSourceArg)).toBe(false);
    expect(labelSourceArg).toEqual(expect.objectContaining({ kind: expect.any(String) }));
  });

  it('composeReport receives the unwrapped, non-empty labels array, never a bare []', async () => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockClusterThemes.mockResolvedValue([]);
    mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
    setupSupabase({ runRow: RUN_A_ROW });

    await generateDiagnosis(CHURCH_A);

    const labelsArg = mockComposeReport.mock.calls[0]?.[0]?.labels;
    expect(labelsArg).toEqual(['Pastor']);
  });
});
