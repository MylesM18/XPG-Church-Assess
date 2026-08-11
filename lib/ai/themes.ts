import { z } from 'zod/v4';

/**
 * GPT task: reflection clustering.
 *
 * ⚠️ This file and lib/ai/theme-gates.ts are the ONLY two files under lib/ai/** permitted to
 * touch raw reflection text, and only this one may place it in a model payload. That boundary
 * is pinned by tests/outreach/ai-exclusion.test.ts — read the contract table at the top of
 * docs/superpowers/plans/2026-08-10-final-report-2-clustering.md before widening it.
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores (eslint.config.mjs:12). A green lint says nothing
 * about this file. tsc and vitest are the gates.
 */

/**
 * One reflection as the SERVER holds it. `respondent_key` is opaque to this module — the
 * caller (plan 3's generation wiring) passes Response.respondent_id, the stable identity,
 * NOT respondent_label, which is display-only and may collide across two different people.
 * Counting on labels would undercount a shared display name and weaken the k>=3 gate.
 *
 * `respondent_key` MUST NOT reach the model. It does not, structurally: the payload is built
 * from IndexedReflection[], which has no field that could carry it.
 */
export interface ReflectionRow {
  item_id: string;
  respondent_key: string;
  text: string;
}

/** The model-facing projection. Opaque index, the prompting item, the text. Nothing else. */
export interface IndexedReflection {
  index: string;
  item_id: string;
  text: string;
}

export interface IndexedReflections {
  /** Sent to the model. */
  rows: IndexedReflection[];
  /** Kept server-side: index -> respondent_key. The gate recomputes support counts from this. */
  owners: Map<string, string>;
}

/**
 * Sort by (item_id, lexicographic text), then assign opaque indices r1..rN.
 *
 * The ordering is fixed rather than input-order so the same set of reflections always
 * produces the same payload and the same indices — the report cache key (plan 3's
 * report-hash.ts) depends on that being reproducible.
 *
 * Tie-break idiom matches lib/report/facts.ts:134.
 */
export function indexReflections(rows: readonly ReflectionRow[]): IndexedReflections {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0) ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );

  const out: IndexedReflection[] = [];
  const owners = new Map<string, string>();
  sorted.forEach((row, i) => {
    const index = `r${i + 1}`;
    out.push({ index, item_id: row.item_id, text: row.text });
    owners.set(index, row.respondent_key);
  });
  return { rows: out, owners };
}

/**
 * P3's verbatim pool: distinct reflection-WRITING respondents, which is deliberately stricter
 * than the run's respondent count (lib/report/facts.ts:182). If only two people wrote
 * reflections, a verbatim identifies among two even when thirty answered numerically.
 */
export function reflectionWriterCount(rows: readonly ReflectionRow[]): number {
  return new Set(rows.map((r) => r.respondent_key)).size;
}

/**
 * One clustered theme as the model returns it. Every field here is a CLAIM, not a fact:
 * lib/ai/theme-gates.ts recomputes support from `owners` and verifies verbatims against
 * source text. Nothing on this object is trusted downstream.
 *
 * `verbatim_candidates` is `.nullable()`, never `.optional()`: OpenAI strict structured
 * outputs put every property in `required`, so an absent optional comes back as null.
 * Same discipline as ReportBlocksSchema in lib/ai/prose.ts.
 */
const ThemeSchema = z.object({
  label: z.string(),
  gloss: z.string(),
  support_indices: z.array(z.string()),
  item_ids: z.array(z.string()),
  verbatim_candidates: z.array(z.string()).nullable(),
});

export const ThemesSchema = z.object({
  themes: z.array(ThemeSchema),
  /** The "what they love about this church" theme, rendered last in S8 when present. */
  affection_theme: ThemeSchema.nullable(),
});

export type ParsedTheme = z.infer<typeof ThemeSchema>;
export type ParsedThemes = z.infer<typeof ThemesSchema>;

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Methodology } from '../methodology/schema';
import type { ThemeClusterFact } from '../report/facts';
import type { LabelSource } from '../report/anonymity';
import { gateThemes, methodologyItemIds } from './theme-gates';

const SYSTEM_PROMPT =
  'You are given short written reflections from a church health assessment. Each one has an ' +
  'opaque index and the id of the question that prompted it. Group them into the themes that ' +
  'recur across them. For each theme give a short label, a one-sentence gloss, the indices of ' +
  'every reflection supporting it, and the question ids those reflections came from. Use only ' +
  'indices you were given; never invent one. Also return one affection theme — what people say ' +
  'they love about this church — or null if none is present. Anything you put in ' +
  'verbatim_candidates must be copied character for character from a reflection: never ' +
  'paraphrase, re-punctuate, or re-case it. Do not name any individual. Write in this register: ' +
  'plain words, warm but precise. No em-dashes. No churchy clichés. Sentence case. Active voice. ' +
  'Return only the JSON.';

/**
 * Cluster reflections into gated themes. NEVER throws.
 *
 * Return contract, and the difference matters to plan 3's caching:
 *   - `ThemeClusterFact[]` (possibly empty) — a determinate answer. `[]` means the model
 *     answered and nothing survived the gates; retrying produces the same verdict, so the
 *     caller should persist it rather than re-call.
 *   - `null` — the task failed (incomplete, unparseable, or threw). The caller falls back to
 *     the existing per-area voices lists (lib/report/view.ts buildOutreachVoices) and may
 *     retry later. Building a second fallback here is NOT this plan's job.
 *
 * Every failure path logs `[report] themes: <reason>` so "AI is broken" stays distinguishable
 * from "AI is off" (which logs nothing at all). Reasons only — never the payload, the parsed
 * output, a theme, a verbatim or an error object. The payload here is raw reflection text,
 * which makes this stricter than prose.ts's rationale (:167-172), not looser.
 */
export async function clusterThemes(
  rows: readonly ReflectionRow[],
  methodology: Methodology,
  labelSource: LabelSource,
): Promise<ThemeClusterFact[] | null> {
  // Nothing to cluster is not a failure: no API call, no log, and the caller gets a
  // determinate empty answer it can cache like any other.
  if (rows.length === 0) return [];

  // Fail closed. A redacted source has no label list, so the theme anonymity gate could not
  // fire — and clustering runs over raw reflection text, the highest-risk payload in the
  // system. `[]` rather than `null`: this is a determinate verdict, not a transient failure,
  // so the caller persists it instead of burning its one re-attempt on the same outcome.
  if (labelSource.kind === 'redacted') {
    console.warn('[report] themes: label source redacted; refusing to cluster without an anonymity gate');
    return [];
  }

  try {
    const { rows: indexed, owners } = indexReflections(rows);
    const client = new OpenAI(); // reads OPENAI_API_KEY from env (server-only)
    const model = process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1';
    const response = await client.responses.parse(
      {
        model,
        // Higher than prose.ts's 4000 because this emits an array of themes over up to ten
        // reflection items rather than one fixed block — and gpt-5.x bills reasoning tokens
        // against this same budget, so exhausting it yields status 'incomplete' (below).
        max_output_tokens: 6000,
        // Clustering short texts, not a reasoning task.
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            // `indexed`, NEVER `rows`. This single line is the whole anonymity design:
            // ReflectionRow carries respondent_key and IndexedReflection cannot, so identity
            // cannot reach the model without an edit right here. tests/outreach/
            // ai-exclusion.test.ts pins it in Task 7. `labelSource.labels` is a gate input
            // only — it is deliberately never sent, because naming the people to avoid would
            // name them.
            content: 'Reflections to cluster:\n' + JSON.stringify(indexed, null, 2),
          },
        ],
        text: { format: zodTextFormat(ThemesSchema, 'reflection_themes') },
      },
      { timeout: 30000, maxRetries: 0 },
    );

    // gpt-5.x bills reasoning tokens against max_output_tokens, so the budget can be
    // exhausted before any JSON is emitted — status 'incomplete' with output_parsed null.
    // Without its own reason string this lands in the generic branch below and reads as a
    // schema miss. Both values of incomplete_details.reason ('max_output_tokens' |
    // 'content_filter') are fixed enum strings, never report content; the field is nullable.
    if (response.status === 'incomplete') {
      console.warn(
        `[report] themes: response incomplete (${response.incomplete_details?.reason ?? 'reason unreported'}); falling back to the per-area voices lists`,
      );
      return null;
    }

    const parsed = response.output_parsed;
    if (!parsed) {
      console.warn('[report] themes: model returned no parsed output; falling back to the per-area voices lists');
      return null;
    }

    // Everything the model claimed is re-derived here. sourceTexts comes from `rows` (the
    // server's copy), not from anything the model echoed back.
    const gated = gateThemes(parsed, {
      owners,
      sourceTexts: rows.map((r) => r.text),
      labels: labelSource.labels,
      validItemIds: methodologyItemIds(methodology),
      writerCount: reflectionWriterCount(rows),
    });

    if (gated.length === 0) {
      console.warn('[report] themes: no theme survived the gates');
      return [];
    }
    return gated;
  } catch (err) {
    console.warn('[report] themes: request failed:', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
