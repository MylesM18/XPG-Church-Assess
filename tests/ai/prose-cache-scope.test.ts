import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { diagnose } from '@/lib/engine';
import { responseHash } from '@/lib/report/response-hash';
import type { Response } from '@/lib/engine/types';

// vi.hoisted so the mocks exist before the hoisted vi.mock factories run.
const { mockCreateClient, mockGenerateProse } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGenerateProse: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }));
vi.mock('@/lib/ai/prose', () => ({ generateProse: mockGenerateProse }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { generateDiagnosis } from '@/app/app/[churchId]/actions';

const m = loadMethodology();
const CHURCH_A = '11111111-1111-1111-1111-111111111111';
const CHURCH_B = '22222222-2222-2222-2222-222222222222';

// Identical answer sets for both churches → identical responseHash. responseHash contains no
// church identifier (lib/report/response-hash.ts), which is what makes the collision possible.
const responses: Response[] = m.questions.categories.flatMap((c) =>
  c.items.map((it) => ({ category_id: c.id, item_id: it.id, value: 7, respondent_label: 'Pastor', respondent_id: 'Pastor' })),
);
const HASH = responseHash(responses, diagnose(responses, m, { attendance_band: '500_999' }).methodology_version);

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

describe('generateDiagnosis AI prose cache-check', () => {
  const saveProseCalls: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.stubEnv('PROSE_MODE', 'ai');
    mockGenerateProse.mockReset();
    mockGenerateProse.mockResolvedValue({ verdict: 'v', next_step: 'n', benchmark_note: 'b' });
    saveProseCalls.length = 0;

    const from = fakeDb({
      churches: [
        { id: CHURCH_A, attendance_band: '500_999' },
        { id: CHURCH_B, attendance_band: '500_999' },
      ],
      assessment_runs: [
        { id: 'run-a', church_id: CHURCH_A, status: 'complete', created_at: '2026-01-01' },
        { id: 'run-b', church_id: CHURCH_B, status: 'complete', created_at: '2026-01-02' },
      ],
      // Church A generated AI prose earlier off the same answers. Church B's row was just
      // inserted by save_diagnosis and has no prose yet.
      diagnoses: [
        { run_id: 'run-a', response_hash: HASH, prose_source: 'ai' },
        { run_id: 'run-b', response_hash: HASH, prose_source: null },
      ],
    });

    mockCreateClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from,
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'get_run_responses') return { data: responses, error: null };
        if (name === 'save_diagnosis') return { data: null, error: null };
        if (name === 'save_prose') { saveProseCalls.push(args); return { data: null, error: null }; }
        return { data: null, error: null };
      },
    });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('generates prose for this church even when another church has an AI row for the same hash', async () => {
    await generateDiagnosis(CHURCH_B);

    expect(mockGenerateProse).toHaveBeenCalledTimes(1);
    expect(saveProseCalls).toHaveLength(1);
    expect(saveProseCalls[0]?.p_church_id).toBe(CHURCH_B);
  });
});
