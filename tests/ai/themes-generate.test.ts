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
    expect(await clusterThemes([], m, { kind: 'known', labels: [] })).toEqual([]);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('refuses to cluster and returns a determinate empty result when the label source is redacted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await clusterThemes(rows, m, { kind: 'redacted' });
    expect(result).toEqual([]);           // determinate, not null — no re-attempt
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[report] themes:'));
    // Fix round A (I6): the return value alone cannot tell "refused before calling the model"
    // apart from "clustered everything, then returned [] anyway" — a rewrite that ships every
    // raw reflection to OpenAI before discarding the result was invisible without this.
    expect(mockParse).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns gated facts on the happy path', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: parsed() });
    expect(await clusterThemes(rows, m, { kind: 'known', labels: ['Priscilla Vandermeer'] })).toEqual([
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
    await clusterThemes(rows, m, { kind: 'known', labels: ['Priscilla Vandermeer'] });
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
      expect(await clusterThemes(rows, m, { kind: 'known', labels: [] })).toBeNull();
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
      expect(await clusterThemes(rows, m, { kind: 'known', labels: [] })).toBeNull();
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
      expect(await clusterThemes(rows, m, { kind: 'known', labels: [] })).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null when responses.parse throws (never throws)', async () => {
    mockParse.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, { kind: 'known', labels: [] })).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('gates verbatims on the real writer pool, not the row count', async () => {
    // Kills `writerCount: reflectionWriterCount(rows)` -> `rows.length` at themes.ts:214.
    // Eight rows but only three people wrote them, so the P3 pool (MIN_WRITERS_FOR_VERBATIM
    // = 8) is NOT open and the quote must be withheld even though it verifies exactly.
    const eight: ReflectionRow[] = [
      { item_id: itemId, respondent_key: 'W1', text: 'nobody explains the plan' },
      { item_id: itemId, respondent_key: 'W1', text: 'communication is thin' },
      { item_id: itemId, respondent_key: 'W1', text: 'meetings end without decisions' },
      { item_id: itemId, respondent_key: 'W2', text: 'we never hear why decisions get made' },
      { item_id: itemId, respondent_key: 'W2', text: 'the vision is unclear' },
      { item_id: itemId, respondent_key: 'W2', text: 'i learn things secondhand' },
      { item_id: itemId, respondent_key: 'W3', text: 'updates arrive too late' },
      { item_id: itemId, respondent_key: 'W3', text: 'nobody owns the follow-up' },
    ];
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        themes: [
          {
            ...theme(),
            support_indices: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'],
            verbatim_candidates: ['nobody explains the plan'],
          },
        ],
        affection_theme: null,
      },
    });
    expect(await clusterThemes(eight, m, { kind: 'known', labels: [] })).toEqual([
      {
        label: 'Communication gaps',
        gloss: 'People say decisions are not explained.',
        support_count: 3,
        item_ids: [itemId],
        verbatims: [],
      },
    ]);
  });

  it('passes the run labels and the server-side source texts into the gates', async () => {
    // Kills `labels: labelSource.labels` -> `[]` and `sourceTexts` -> `[]` at themes.ts:211-212.
    // BOTH candidates verify as exact substrings of real reflection text, so only the label
    // ban separates them: a severed label list prints a respondent's name as a quote, and a
    // severed source-text list drops the legitimate quote instead.
    const label = 'Marguerite Oyelaran';
    const eight: ReflectionRow[] = [
      { item_id: itemId, respondent_key: 'W1', text: 'nobody explains the plan' },
      { item_id: itemId, respondent_key: 'W2', text: `${label} never returns my calls` },
      { item_id: itemId, respondent_key: 'W3', text: 'communication is thin' },
      { item_id: itemId, respondent_key: 'W4', text: 'we never hear why decisions get made' },
      { item_id: itemId, respondent_key: 'W5', text: 'the vision is unclear' },
      { item_id: itemId, respondent_key: 'W6', text: 'i learn things secondhand' },
      { item_id: itemId, respondent_key: 'W7', text: 'updates arrive too late' },
      { item_id: itemId, respondent_key: 'W8', text: 'nobody owns the follow-up' },
    ];
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        themes: [
          {
            ...theme(),
            support_indices: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'],
            verbatim_candidates: ['nobody explains the plan', `${label} never returns my calls`],
          },
        ],
        affection_theme: null,
      },
    });
    expect(await clusterThemes(eight, m, { kind: 'known', labels: [label] })).toEqual([
      {
        label: 'Communication gaps',
        gloss: 'People say decisions are not explained.',
        support_count: 8,
        item_ids: [itemId],
        verbatims: ['nobody explains the plan'],
      },
    ]);
  });
});
