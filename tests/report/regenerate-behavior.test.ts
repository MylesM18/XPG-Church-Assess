import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { diagnose } from '@/lib/engine';
import { responseHash } from '@/lib/report/response-hash';
import { reportInputsHash } from '@/lib/report/report-hash';
import { buildFacts, type ChurchFacts } from '@/lib/report/facts';
import { knownLabels } from '@/lib/report/anonymity';
import type { Response } from '@/lib/engine/types';

/**
 * BEHAVIOR tests for regenerateReport's recency guard (fix/auto-generate-hardening).
 *
 * tests/report/regenerate.test.ts pins the SHAPE of the dedup block by source text; until this
 * file nothing executed regenerateReport at all, so the window's direction, its NaN / negative-age
 * handling, the usability gate, and what happens on a skip were pinned only by string presence —
 * flipping `<` to `>` kept every test green (post-merge review of PR #79, finding 11). This file
 * drives the real action against the same PostgREST-shaped fake client that
 * tests/report/generate-report-behavior.test.ts uses for generateDiagnosis, with a
 * `church_members` admin row so requireChurchAdmin passes and a `reports` fixture per case.
 *
 * Contract under test (see the docblock on regenerateReport):
 *   - a USABLE row at (run_id, inputs_hash) younger than REGENERATE_DEDUP_WINDOW_MS ⇒ skip, and
 *     the page is STILL revalidated (a manual click from a tab rendered before another tab's write
 *     must see the fresh row — Next does not re-render a form action that neither revalidates nor
 *     redirects; finding 6);
 *   - an older usable row ⇒ regenerate (window direction);
 *   - a 100 %-fallback row never suppresses a MANUAL regenerate (the H7 point) — but an
 *     AUTO-triggered call (`auto=1`, sent only by the diagnosis page's mount effect) backs off from
 *     ANY row younger than the window, usable or not: the client latch is per tab and the dashboard
 *     opens the page in a new tab, so without this a persistently failing model is re-run in full
 *     on every view (finding 2);
 *   - `generated_at` is Postgres now() and Date.now() is the function's clock; a row stamped a few
 *     seconds AHEAD is still "just written", not "not yet written" (finding 14);
 *   - a failed `reports` read fails open (one duplicate spend beats a pinned fallback report) but
 *     says so under `[report]`.
 */

const { mockCreateClient, mockClusterThemes, mockComposeReport, mockRevalidatePath } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockClusterThemes: vi.fn(),
  mockComposeReport: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }));
vi.mock('@/lib/ai/prose', () => ({ generateProse: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/ai/themes', () => ({ clusterThemes: mockClusterThemes }));
vi.mock('@/lib/report/compose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/report/compose')>();
  return { ...actual, composeReport: mockComposeReport };
});
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { regenerateReport } from '@/app/app/[churchId]/actions';

const m = loadMethodology();
const CHURCH_A = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'user-1';

const responses: Response[] = m.questions.categories.flatMap((c) =>
  c.items.map((it) => ({ category_id: c.id, item_id: it.id, value: 7, respondent_label: 'Pastor', respondent_id: 'Pastor' })),
);
const DIAGNOSIS = diagnose(responses, m, { attendance_band: '500_999' });
const HASH = responseHash(responses, DIAGNOSIS.methodology_version);

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
const LABEL_SOURCE = knownLabels(responses);
const BASE_FACTS_FOR_HASH = buildFacts({
  diagnosis: DIAGNOSIS,
  methodology: m,
  responses,
  church: CHURCH_FACTS,
  completedAt: null,
  labelSource: LABEL_SOURCE,
});
// The genuine key regenerateReport computes for these fixtures (never a hardcoded digest).
const REPORT_INPUTS_HASH = reportInputsHash({
  methodologyVersion: DIAGNOSIS.methodology_version,
  responseHash: HASH,
  methodology: m,
  reflections: [],
  profile: BASE_FACTS_FOR_HASH.profile,
  reportVersion: m.report.version,
});

const RUN_A_ROW = {
  id: 'run-a',
  church_id: CHURCH_A,
  status: 'complete',
  created_at: '2026-01-01',
  completed_at: '2026-01-02T00:00:00.000Z',
  methodology_version: m.questions.version,
};

type Row = Record<string, unknown>;

/** Minimal PostgREST-shaped fake; `errors[table]` makes that table's reads return an error. */
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, { message: string }> = {}) {
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
    const err = errors[table] ?? null;

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push([col, val]); return api; },
      order: (col: string) => { sortKey = col; return api; },
      limit: (n: number) => { cap = n; return api; },
      maybeSingle: async () => (err ? { data: null, error: err } : { data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
        resolve(err ? { data: null, error: err } : { data: rows(), error: null }),
    };
    return api;
  }
  return builder;
}

function setupSupabase(opts: { reportsRows?: Row[]; reportsReadError?: { message: string } } = {}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const from = fakeDb(
    {
      church_members: [{ church_id: CHURCH_A, user_id: USER_ID, role: 'admin' }],
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
      assessment_runs: [RUN_A_ROW],
      reports: opts.reportsRows ?? [],
    },
    opts.reportsReadError ? { reports: opts.reportsReadError } : {},
  );

  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'get_completed_run_responses') return { data: RAW_ROWS, error: null };
      return { data: null, error: null };
    },
  });

  return { rpcCalls };
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

const usableRow = (generatedAt: string): Row => ({
  run_id: 'run-a',
  church_id: CHURCH_A,
  inputs_hash: REPORT_INPUTS_HASH,
  section_sources: { s2: 'ai', s3: 'fallback' },
  generated_at: generatedAt,
});
const fallbackRow = (generatedAt: string): Row => ({
  run_id: 'run-a',
  church_id: CHURCH_A,
  inputs_hash: REPORT_INPUTS_HASH,
  section_sources: { s2: 'fallback', s3: 'fallback' },
  generated_at: generatedAt,
});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('PROSE_MODE', 'ai');
  mockCreateClient.mockReset();
  mockClusterThemes.mockReset();
  mockClusterThemes.mockResolvedValue(null);
  mockComposeReport.mockReset();
  mockComposeReport.mockResolvedValue({ sections: {}, section_sources: {} });
  mockRevalidatePath.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warnSpy.mockRestore();
});

const reportLines = () =>
  warnSpy.mock.calls.map((args) => args.map((a) => String(a)).join(' ')).filter((l) => l.startsWith('[report]'));

const ranModel = (rpcCalls: Array<{ name: string }>) => ({
  themes: mockClusterThemes.mock.calls.length,
  compose: mockComposeReport.mock.calls.length,
  saved: rpcCalls.filter((c) => c.name === 'save_report').length,
});

describe('regenerateReport recency guard (behavior)', () => {
  it('skips when a USABLE row at the live inputs hash was written 60 s ago — no model call, no save — and still revalidates the page', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [usableRow(secondsAgo(60))] });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 0, compose: 0, saved: 0 });
    expect(reportLines().some((l) => l.startsWith('[report] regenerate skipped:'))).toBe(true);
    // The clicking tab may have rendered BEFORE the other tab's write; without a revalidate the
    // notice and button stay on screen for the rest of the window.
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/${CHURCH_A}/diagnosis`);
  });

  it('regenerates when the usable row is OLDER than the window (11 min) — window direction', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [usableRow(secondsAgo(11 * 60))] });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 1, compose: 1, saved: 1 });
    expect(reportLines().some((l) => l.includes('skipped'))).toBe(false);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/${CHURCH_A}/diagnosis`);
  });

  it('a fresh 100 %-fallback row never suppresses a MANUAL regenerate (H7-B is exactly the row to replace)', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [fallbackRow(secondsAgo(60))] });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 1, compose: 1, saved: 1 });
  });

  it('an AUTO-triggered call (auto=1) backs off from a fresh 100 %-fallback row: no model call, a skip line, page revalidated', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [fallbackRow(secondsAgo(60))] });

    await regenerateReport(formData({ churchId: CHURCH_A, auto: '1' }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 0, compose: 0, saved: 0 });
    expect(reportLines().some((l) => l.startsWith('[report] regenerate skipped:'))).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/${CHURCH_A}/diagnosis`);
  });

  it('an AUTO-triggered call still regenerates once the fallback row is older than the window', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [fallbackRow(secondsAgo(11 * 60))] });

    await regenerateReport(formData({ churchId: CHURCH_A, auto: '1' }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 1, compose: 1, saved: 1 });
  });

  it('a usable row stamped a few seconds in the FUTURE (DB clock ahead) still counts as just written', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [usableRow(secondsAgo(-5))] });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 0, compose: 0, saved: 0 });
    expect(reportLines().some((l) => l.startsWith('[report] regenerate skipped:'))).toBe(true);
  });

  it('a usable row stamped far in the future is NOT treated as fresh (fail-closed guard against a bad clock)', async () => {
    const { rpcCalls } = setupSupabase({ reportsRows: [usableRow(secondsAgo(-60 * 60))] });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 1, compose: 1, saved: 1 });
  });

  it('a failed reports read fails OPEN (regenerates) but names the read failure under [report]', async () => {
    const { rpcCalls } = setupSupabase({ reportsReadError: { message: 'connection reset' } });

    await regenerateReport(formData({ churchId: CHURCH_A }));

    expect(ranModel(rpcCalls)).toEqual({ themes: 1, compose: 1, saved: 1 });
    const readFail = reportLines().filter((l) => l.startsWith('[report] reports read failed'));
    expect(readFail).toHaveLength(1);
    // Reason only — never the row or any church / respondent data.
    expect(readFail[0]).not.toContain(CHURCH_A);
    expect(readFail[0]).not.toContain(REPORT_INPUTS_HASH);
  });
});
