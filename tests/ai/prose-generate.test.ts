import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine';
import { fallbackProse, type ReportBlocks } from '../../lib/ai/fallback';
import type { Response } from '../../lib/engine/types';

// vi.hoisted so `mockParse` exists before the hoisted vi.mock factory runs.
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(() => ({ responses: { parse: mockParse } })),
}));
vi.mock('openai/helpers/zod', () => ({
  zodTextFormat: vi.fn(() => ({ type: 'json_schema' })),
}));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { generateProse } from '../../lib/ai/prose';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor', respondent_id: 'Pastor' }));
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
    gating: b.gating ?? null, dispersion: b.dispersion ?? null,
  };
}

describe('generateProse', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('returns ReportBlocks when the reword passes the fact-check', async () => {
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: asParsed({ ...draftFull, verdict: draftFull.verdict + ' Reworded.' }),
    });
    const result = await generateProse(dBroken, m);
    expect(result).not.toBeNull();
    expect(result!.verdict).toContain('Guest Experience');

    // Pins the SDK call shape (binding Global Constraint): model from
    // env-with-default, no temperature/top_p (unsupported on gpt-5.x reasoning
    // models), low reasoning effort (this is a reword, not a reasoning task),
    // and the exact retry/timeout config. `text.format` asserts against this
    // test's own zodTextFormat stub, not the real helper's return value.
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1',
        max_output_tokens: 4000,
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema' } },
      }),
      { timeout: 30000, maxRetries: 0 },
    );
    const callArgs = mockParse.mock.calls[0]![0];
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('top_p');
  });

  // The system prompt moves from a top-level `system:` param (Anthropic) to the first
  // element of `input` (OpenAI Responses). Pin that it is still sent, and still first —
  // dropping it silently would let the model invent facts the fact-check may not catch.
  it('sends the system prompt as the first input element, user draft second', async () => {
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: asParsed(draftFull),
    });
    await generateProse(dBroken, m);
    const callArgs = mockParse.mock.calls[0]![0];
    expect(callArgs).not.toHaveProperty('system');
    expect(callArgs).not.toHaveProperty('messages');
    expect(callArgs.input).toHaveLength(2);
    expect(callArgs.input[0].role).toBe('system');
    expect(callArgs.input[0].content).toContain('You are given a fixed set of facts');
    expect(callArgs.input[1].role).toBe('user');
  });

  it('returns null when the reword fails the fact-check (invented number)', async () => {
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: asParsed({ ...draftFull, verdict: draftFull.verdict + ' 987654 souls.' }),
    });
    expect(await generateProse(dBroken, m)).toBeNull();
  });

  it('returns null when responses.parse throws (never throws)', async () => {
    mockParse.mockRejectedValue(new Error('network down'));
    expect(await generateProse(dBroken, m)).toBeNull();
  });

  it('returns null when output_parsed is null', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: null });
    expect(await generateProse(dBroken, m)).toBeNull();
  });

  // gpt-5.x counts reasoning tokens against max_output_tokens, so a run can end with
  // status 'incomplete' and output_parsed null. That is indistinguishable from a plain
  // schema miss unless it logs its own reason — and this file's contract is that
  // "AI is broken" always stays distinguishable from "AI is off" (the PROSE_MODE gate).
  it('logs the truncation reason when the response is incomplete', async () => {
    mockParse.mockResolvedValue({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_parsed: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await generateProse(dBroken, m)).toBeNull();
      const messages = warn.mock.calls.map(c => c.join(' '));
      expect(messages.some(msg => msg.includes('incomplete') && msg.includes('max_output_tokens'))).toBe(true);
      // Reason strings only — never report content. `d` carries respondent labels.
      for (const msg of messages) expect(msg).not.toContain('Guest Experience');
    } finally {
      warn.mockRestore();
    }
  });

  // `incomplete_details` is nullable on the Response type; a missing reason must not throw.
  it('handles an incomplete response with no incomplete_details', async () => {
    mockParse.mockResolvedValue({ status: 'incomplete', incomplete_details: null, output_parsed: null });
    expect(await generateProse(dBroken, m)).toBeNull();
  });
});
