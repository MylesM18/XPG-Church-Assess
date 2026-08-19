import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import type { Response } from '@/lib/engine/types';

// vi.hoisted so the mocks exist before the hoisted vi.mock factories run.
const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { generateDiagnosis } from '@/app/app/[churchId]/actions';

const m = loadMethodology();
const CHURCH_A = '11111111-1111-1111-1111-111111111111';

// The M5b diagnosis-prose cache-check this file was written for (a sibling church's 'ai' row at
// the same responseHash must not suppress this church's prose) was retired with the M5b block in
// fix/auto-generate-hardening — nothing rendered `diagnoses.prose` any more. The report path's
// equivalent scoping (run_id AND inputs_hash) is pinned in tests/report/generate-report-wiring.test.ts
// and tests/report/regenerate.test.ts. What remains here is the run-lookup bail below.
const responses: Response[] = m.questions.categories.flatMap((c) =>
  c.items.map((it) => ({ category_id: c.id, item_id: it.id, value: 7, respondent_label: 'Pastor', respondent_id: 'Pastor' })),
);

type Row = Record<string, unknown>;

/**
 * Minimal PostgREST-shaped fake. It applies exactly the filters the caller supplies and nothing
 * else — which is precisely how RLS behaves for a user who administers BOTH churches: every
 * `diagnoses` row they can see comes back unless the query narrows it further.
 */
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

/**
 * The run lookup moved ABOVE the derive (it now selects the scoring edition), which changed what a
 * failed read costs. It used to mean one prose cache miss — harmless. Now `run === null` means a
 * null methodology_version, so a CURRENT run is scored as if it predated the outreach questions:
 * its outreach answers are dropped, the diagnosis is stamped '0.2.0', and save_diagnosis PERSISTS
 * it with no error shown to the admin. This pins the bail.
 */
describe('generateDiagnosis when the run lookup errors', () => {
  beforeEach(() => { vi.stubEnv('PROSE_MODE', 'fallback'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns the error and never reaches save_diagnosis', async () => {
    const rpcCalls: string[] = [];
    const base = fakeDb({ churches: [{ id: CHURCH_A, attendance_band: '500_999' }] });

    mockCreateClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table !== 'assessment_runs') return base(table);
        // A transient read failure. `data` is null exactly as it would be for a genuine no-row
        // result — the error is the ONLY thing that distinguishes the two, which is why the guard
        // has to key on it rather than on `!run`.
        const api = {
          select: () => api,
          eq: () => api,
          order: () => api,
          limit: () => api,
          maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }),
        };
        return api;
      },
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: name === 'get_run_responses' ? responses : null, error: null };
      },
    });

    const result = await generateDiagnosis(CHURCH_A);

    expect(result).toEqual({ ok: false, error: 'connection reset' });
    // The mutation target: without the bail, these responses score clean against the filtered
    // '0.2.0' edition and get persisted.
    expect(rpcCalls).not.toContain('save_diagnosis');
  });
});
