import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine';
import { fallbackProse, type ReportBlocks } from '../../lib/ai/fallback';
import type { Response } from '../../lib/engine/types';

// vi.hoisted so `mockParse` exists before the hoisted vi.mock factory runs.
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { parse: mockParse } })),
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: vi.fn(() => ({ type: 'json_schema' })),
}));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { generateProse } from '../../lib/ai/prose';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor' }));
}
const dBroken = diagnose(
  [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
   ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
  m, { attendance_band: '500_999' },
);
const draftFull = fallbackProse(dBroken, m);

// Simulate strict structured output: every key present, absent optionals as null.
function asParsed(b: ReportBlocks): Record<string, string | null> {
  return {
    verdict: b.verdict, evidence: b.evidence ?? null, blind_spot: b.blind_spot ?? null,
    cost: b.cost ?? null, do_not_work_on: b.do_not_work_on ?? null, next_step: b.next_step,
    gating: b.gating ?? null, dispersion: b.dispersion ?? null, benchmark_note: b.benchmark_note,
  };
}

describe('generateProse', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('returns ReportBlocks when the reword passes the fact-check', async () => {
    mockParse.mockResolvedValue({
      parsed_output: asParsed({ ...draftFull, verdict: draftFull.verdict + ' Reworded.' }),
    });
    const result = await generateProse(dBroken, m);
    expect(result).not.toBeNull();
    expect(result!.verdict).toContain('Guest Experience');

    // Pins the SDK call shape (binding Global Constraint): model from
    // env-with-default, no temperature/top_p (both @deprecated on Sonnet-5),
    // and the exact retry/timeout config. output_config asserts against this
    // test's own zodOutputFormat stub, not the real helper's return value.
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: process.env.ANTHROPIC_MODEL_PROSE ?? 'claude-sonnet-5',
        max_tokens: 1500,
        output_config: { format: { type: 'json_schema' } },
      }),
      { timeout: 15000, maxRetries: 0 },
    );
    const callArgs = mockParse.mock.calls[0]![0];
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('top_p');
  });

  it('returns null when the reword fails the fact-check (invented number)', async () => {
    mockParse.mockResolvedValue({
      parsed_output: asParsed({ ...draftFull, verdict: draftFull.verdict + ' 987654 souls.' }),
    });
    expect(await generateProse(dBroken, m)).toBeNull();
  });

  it('returns null when messages.parse throws (never throws)', async () => {
    mockParse.mockRejectedValue(new Error('network down'));
    expect(await generateProse(dBroken, m)).toBeNull();
  });

  it('returns null when parsed_output is null', async () => {
    mockParse.mockResolvedValue({ parsed_output: null });
    expect(await generateProse(dBroken, m)).toBeNull();
  });
});
