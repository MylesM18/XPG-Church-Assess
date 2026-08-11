import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { ReflectionRow } from '../../lib/ai/themes';

// vi.hoisted so `mockParse` exists before the hoisted vi.mock factory runs.
// Idiom copied from tests/ai/prose-generate.test.ts:7-17 — do not invent a new one.
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(() => ({ responses: { parse: mockParse } })),
}));
vi.mock('openai/helpers/zod', () => ({
  zodTextFormat: vi.fn(() => ({ type: 'json_schema' })),
}));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { clusterThemes } from '../../lib/ai/themes';

const m = loadMethodology();
const itemId = m.questions.categories[0]!.items[0]!.id;

// Respondent keys are deliberately loud and unlike anything else in the payload, so the
// "no identity on the wire" assertion below is a real check and not a lucky miss.
const rows: ReflectionRow[] = [
  { item_id: itemId, respondent_key: 'RESPONDENT-ALPHA', text: 'nobody explains the plan' },
  { item_id: itemId, respondent_key: 'RESPONDENT-BRAVO', text: 'we never hear why decisions get made' },
  { item_id: itemId, respondent_key: 'RESPONDENT-CHARLIE', text: 'communication is thin' },
];

// Sorted by (item_id, text) the rows become r1='communication is thin',
// r2='nobody explains the plan', r3='we never hear why...' — three distinct owners.
const theme = () => ({
  label: 'Communication gaps',
  gloss: 'People say decisions are not explained.',
  support_indices: ['r1', 'r2', 'r3'],
  item_ids: [itemId],
  verbatim_candidates: null,
});
const parsed = () => ({ themes: [theme()], affection_theme: null });

describe('clusterThemes', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('returns [] without calling the model when there are no reflections', async () => {
    expect(await clusterThemes([], m, [])).toEqual([]);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('returns gated facts on the happy path', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: parsed() });
    expect(await clusterThemes(rows, m, ['Priscilla Vandermeer'])).toEqual([
      {
        label: 'Communication gaps',
        gloss: 'People say decisions are not explained.',
        support_count: 3,
        item_ids: [itemId],
        verbatims: [],
      },
    ]);

    // Pins the SDK call shape, mirroring tests/ai/prose-generate.test.ts:58-69: model from
    // env-with-default, the 6000 budget this task needs, low reasoning effort, and the exact
    // retry/timeout config. `text.format` asserts against this file's zodTextFormat stub.
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1',
        max_output_tokens: 6000,
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema' } },
      }),
      { timeout: 30000, maxRetries: 0 },
    );
    const callArgs = mockParse.mock.calls[0]![0];
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('top_p');
  });

  it('sends the projection and no respondent identity', async () => {
    // The anonymity invariant asserted against the REAL serialized payload, not against the
    // projection helper. An edit that serializes ReflectionRow[] instead fails here, and so
    // does one that helpfully appends the label list to the prompt.
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: parsed() });
    await clusterThemes(rows, m, ['Priscilla Vandermeer']);
    const payload = JSON.stringify(mockParse.mock.calls[0]![0]);
    expect(payload).not.toContain('RESPONDENT-');
    expect(payload).not.toContain('respondent_key');
    expect(payload).not.toContain('Priscilla Vandermeer');
    // ...while the reflection text itself IS sent — otherwise this test would pass vacuously
    // against a function that sends nothing at all.
    expect(payload).toContain('nobody explains the plan');
  });

  it('returns null and logs a reason when the response is incomplete', async () => {
    mockParse.mockResolvedValue({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_parsed: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
      const messages = warn.mock.calls.map((c) => c.join(' '));
      expect(messages.some((msg) => msg.includes('[report] themes:') && msg.includes('max_output_tokens'))).toBe(true);
      // Reasons only, never content — the payload here is raw reflection text.
      for (const msg of messages) expect(msg).not.toContain('nobody explains the plan');
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null when output_parsed is null', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns [] rather than null when every theme fails the gates', async () => {
    // A fully gated-out run is a determinate verdict, not a failure: a retry would gate the
    // same way, so plan 3 should persist [] and stop. null means "try me again".
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: { themes: [{ ...theme(), support_indices: ['r1'] }], affection_theme: null },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null when responses.parse throws (never throws)', async () => {
    mockParse.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
});
