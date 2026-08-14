import { z } from 'zod/v4';
import type { FactsPack } from '../report/facts';
import type { SectionId } from '../methodology/schema';

/**
 * GPT task: per-section composition (parent spec line 72).
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores (eslint.config.mjs:12). A green lint says nothing
 * about this file. tsc and vitest are the gates.
 *
 * Registry in TS, copy in YAML (addendum C6). Anything a compiler must check — the Zod schemas,
 * the facts-slice selectors, the token budgets, which sections are AI at all — lives here.
 * methodology/report.yaml carries only copy, so Natalie edits templates without a code change
 * and a section cannot be declared AI in one file with no schema in the other.
 *
 * Every schema field is `.nullable()` rather than `.optional()`: OpenAI strict structured
 * outputs put every property in `required`, so an absent optional comes back as null. Same
 * discipline as ReportBlocksSchema in prose.ts and ThemeSchema in themes.ts.
 */

export const S2Schema = z.object({
  summary: z.string(),
  what_this_is_not: z.string(),
  context_bullets: z.array(z.string()),
});
export const S4Schema = z.object({ thesis_word: z.string(), narrative: z.string() });
export const S5Schema = z.object({
  strengths: z.array(z.object({ category_id: z.string(), heading: z.string(), body: z.string() })),
});
// SIX beats, as report.yaml's s6 prose always described. This was three for as long as pivot,
// not_statement and trajectory had no data source anywhere in the facts pack or copy.yaml:
// every field here is required and non-nullable under zodTextFormat's strict structured outputs
// and gate 1 rejects any blank among them, so listing a sourceless beat COMPELS the model to
// invent text for it — text that then counts against length_ceiling, numeric containment and
// banned phrases, each an extra chance to lose the section to fallback.
//
// All three now have deterministic sources (copy.beats.* plus, respectively, the facts.categories
// ranking, this area's facts.bottom_items themes, and facts.profile.growth_trajectory — see
// pivotBeat / notStatementBeat / trajectoryBeat in lib/report/fallback-sections.ts), and the
// fallback draft the model rewords already carries all six. THE RULE IS UNCHANGED: do not add a
// seventh beat here before it has a data source.
export const S6Schema = z.object({
  areas: z.array(z.object({
    category_id: z.string(),
    affirm: z.string(),
    pivot: z.string(),
    evidence: z.string(),
    not_statement: z.string(),
    reframe: z.string(),
    trajectory: z.string(),
  })),
});
export const S7Schema = z.object({ narrative: z.string(), pattern_claim: z.string().nullable() });
export const S9Schema = z.object({ narrative: z.string(), working_model: z.string() });
export const S12Schema = z.object({
  assessment: z.string(), overall_percent: z.number(), tier_name: z.string(), primary_objective: z.string(),
});

/**
 * A compile-time link back to the schema's own section-id union (ruling E): `SectionId` is
 * `keyof Report['sections']`, the literal union of all 13 named sections. Deriving
 * `AiSectionId` as an `Extract` over it means a section-id rename in methodology/schema.ts
 * that removes one of these seven literals from `SectionId` breaks the build here — either
 * this Extract silently drops the renamed id (which then breaks the SECTION_REGISTRY object
 * literal below via a missing-property error) or, if the id is renamed to something that no
 * longer matches, the same object literal fails on excess/missing properties. Either way the
 * mismatch cannot survive to runtime.
 */
export type AiSectionId = Extract<SectionId, 's2' | 's4' | 's5' | 's6' | 's7' | 's9' | 's12'>;
export const AI_SECTION_IDS = ['s2', 's4', 's5', 's6', 's7', 's9', 's12'] as const satisfies readonly AiSectionId[];

/**
 * The shared head of every slice. PICKED field by field, never omitted from the whole pack:
 * an omit-list silently widens the moment a field is added to FactsPack, and one of those
 * fields is the theme structure that carries quotes. Picking cannot leak forward.
 */
function head(facts: FactsPack) {
  return {
    archetype: facts.archetype,
    overall: facts.overall,
    primary_constraint: facts.primary_constraint,
  };
}

/** Themes reduced to what a composer may reason about: no quoted text, ever. */
function themeDigest(facts: FactsPack) {
  return facts.themes.map((t) => ({
    label: t.label, gloss: t.gloss, support_count: t.support_count, item_ids: t.item_ids,
  }));
}

export interface SectionRegistryEntry {
  /** `ZodObject`, not `ZodType`: zodTextFormat needs an object schema, and typing it loosely
   *  here forces an `as never` at the call site that would hide a real mismatch. */
  schema: z.ZodObject<z.ZodRawShape>;
  slice: (facts: FactsPack) => unknown;
  maxOutputTokens: number;
}

export const SECTION_REGISTRY: Record<AiSectionId, SectionRegistryEntry> = {
  s2:  { schema: S2Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), cover: f.cover, profile: f.profile }) },
  s4:  { schema: S4Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories, gating: f.gating }) },
  s5:  { schema: S5Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories.slice(0, 3) }) },
  s6:  { schema: S6Schema,  maxOutputTokens: 8000, slice: (f) => ({ ...head(f), categories: f.categories.slice(3), blind_spots: f.blind_spots, dispersion: f.dispersion, top_three: f.categories.slice(0, 3), bottom_items: f.bottom_items, growth_trajectory: f.profile.growth_trajectory ?? null }) },
  s7:  { schema: S7Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), bottom_items: f.bottom_items, pattern_counts: f.pattern_counts }) },
  s9:  { schema: S9Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), dependencies: f.dependencies, gating: f.gating, themes: themeDigest(f) }) },
  s12: { schema: S12Schema, maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories }) },
};

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Methodology } from '../methodology/schema';

/** Warn-once latch. A 13-section report would otherwise emit the same line seven times. */
let missingKeyWarned = false;

/**
 * `new OpenAI()` throws on a missing key, which composeSection's catch resolves to a generic
 * "request failed" — indistinguishable from a network blip, and the reason the fallback-only
 * sample report read as composed prose for weeks (spec §0/§7.2). Name the actual cause once.
 */
function warnIfKeyAbsent(): void {
  if (missingKeyWarned || process.env.OPENAI_API_KEY) return;
  missingKeyWarned = true;
  console.warn('[report] OPENAI_API_KEY absent — every AI section will fall back to the deterministic spine');
}

/**
 * One section call. NEVER throws — incomplete, unparseable and request failure all resolve to
 * null, and the caller renders that section's deterministic fallback.
 *
 * Every failure path logs `[report] section <id>: <reason>` so "AI is broken" stays
 * distinguishable from "AI is off", which logs nothing at all. Reasons only: never the payload,
 * the parsed output, section text, or the facts pack — the pack carries church-specific scores
 * and admin prose.
 */
export async function composeSection(
  id: AiSectionId, facts: FactsPack, methodology: Methodology,
): Promise<unknown | null> {
  const entry = SECTION_REGISTRY[id];
  const copy = methodology.report.sections[id];
  try {
    warnIfKeyAbsent();
    const client = new OpenAI();
    const model = process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1';
    const response = await client.responses.parse(
      {
        model,
        max_output_tokens: entry.maxOutputTokens,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: `${methodology.report.style_spine}\n\n${copy.templates[facts.archetype]}` },
          { role: 'user', content: `Facts for "${copy.title}" — use no number or name absent from this:\n${JSON.stringify(entry.slice(facts), null, 2)}` },
        ],
        text: { format: zodTextFormat(entry.schema, `report_${id}`) },
      },
      { timeout: 30000, maxRetries: 0 },
    );

    if (response.status === 'incomplete') {
      console.warn(`[report] section ${id}: response incomplete (${response.incomplete_details?.reason ?? 'reason unreported'})`);
      return null;
    }
    const parsed = response.output_parsed;
    if (!parsed) {
      console.warn(`[report] section ${id}: model returned no parsed output`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[report] section ${id}: request failed:`, err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
