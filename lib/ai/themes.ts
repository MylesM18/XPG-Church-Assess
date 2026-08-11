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
 * Tie-break idiom matches lib/report/facts.ts:140.
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
 * than the run's respondent count (lib/report/facts.ts:156). If only two people wrote
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
