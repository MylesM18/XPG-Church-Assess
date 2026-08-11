import { containsRespondentLabel } from '../report/anonymity';
import type { Methodology } from '../methodology/schema';
import type { ThemeClusterFact } from '../report/facts';
import type { ParsedTheme, ParsedThemes } from './themes';

/**
 * Theme gates. Pure, no I/O — the model's output is a set of CLAIMS and this file is where
 * each one is either re-derived from server state or thrown away.
 *
 * Modelled on lib/ai/prose.ts's passesFactCheck, with one deliberate widening: prose.ts
 * scopes its anonymity check to disagreement_flags[].respondents[].label and says so at
 * :117-121. This gate matches against ALL run respondents' labels (spec line 71), because
 * a clustered theme is built from free text any respondent wrote, not from the engine's
 * flagged subset. That is intentional, not an inconsistency with prose.ts.
 *
 * ⚠️ This file may hold raw reflection text (sourceTexts) — it is the second of exactly two
 * files under lib/ai/** permitted to. It must never place that text in a model payload;
 * only lib/ai/themes.ts talks to the model.
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores. Lint proves nothing here.
 */

/** Locked decision 5: a theme prints only with >=3 distinct supporting respondents. */
export const MIN_SUPPORT = 3;
/** P3: distinct reflection-WRITING respondents, stricter than the run respondent count. */
export const MIN_WRITERS_FOR_VERBATIM = 8;
export const MAX_VERBATIM_CHARS = 200;

export interface GateContext {
  /** index -> respondent_key, from indexReflections(). The ONLY source of support truth. */
  owners: ReadonlyMap<string, string>;
  /** Raw source reflection texts, for exact substring verification of verbatims. */
  sourceTexts: readonly string[];
  /** Display labels of ALL respondents in the run. */
  labels: readonly string[];
  /** Item ids in the effective methodology. */
  validItemIds: ReadonlySet<string>;
  /** reflectionWriterCount(rows). */
  writerCount: number;
}

export function methodologyItemIds(methodology: Methodology): Set<string> {
  const ids = new Set<string>();
  for (const category of methodology.questions.categories) {
    for (const item of category.items) ids.add(item.id);
  }
  return ids;
}

/**
 * Gate one theme. Returns the fact to ship, or null to drop this theme (and only this one).
 *
 * Whole-theme failures: support, item ids, labels. Candidate-level failures drop the single
 * verbatim and keep the theme — a theme is still worth printing without a quote.
 */
export function gateTheme(theme: ParsedTheme, ctx: GateContext): ThemeClusterFact | null {
  // 1. k>=3 DISTINCT respondents, recomputed from the server-side map. An index the model
  //    invented has no owner and contributes nothing — silently ignored rather than treated
  //    as an error, because one bad index should not cost a theme that is otherwise supported.
  const supporters = new Set<string>();
  for (const index of theme.support_indices) {
    const owner = ctx.owners.get(index);
    if (owner) supporters.add(owner);
  }
  if (supporters.size < MIN_SUPPORT) return null;

  // 2. Item ids must exist in the effective methodology. An empty list is vacuously valid but
  //    unattributable — S8 groups by the prompting item, so an orphan theme has nowhere to go.
  if (theme.item_ids.length === 0) return null;
  for (const id of theme.item_ids) {
    if (!ctx.validItemIds.has(id)) return null;
  }

  // 3. No respondent label in the label or gloss.
  if (containsRespondentLabel(theme.label, ctx.labels)) return null;
  if (containsRespondentLabel(theme.gloss, ctx.labels)) return null;

  // 4. Verbatims. Gated as a group by the P3 writer pool, then individually.
  //    The substring test is CASE-SENSITIVE and exact: a re-cased or re-punctuated quote is
  //    a paraphrase the model authored, not something a person wrote, and the whole point of
  //    a verbatim is that a human said exactly that. Trim the candidate only (models pad
  //    whitespace); the source text stays authoritative.
  const verbatims: string[] = [];
  if (ctx.writerCount >= MIN_WRITERS_FOR_VERBATIM) {
    for (const candidate of theme.verbatim_candidates ?? []) {
      const v = candidate.trim();
      if (!v || v.length > MAX_VERBATIM_CHARS) continue;
      if (!ctx.sourceTexts.some((t) => t.includes(v))) continue;
      if (containsRespondentLabel(v, ctx.labels)) continue;
      verbatims.push(v);
    }
  }

  return {
    label: theme.label,
    gloss: theme.gloss,
    // Server-computed. The model does not report a count and would not be believed if it did.
    support_count: supporters.size,
    item_ids: [...theme.item_ids],
    verbatims,
  };
}

/** Gate every theme; failures drop individually. The affection theme renders last (spec S8). */
export function gateThemes(parsed: ParsedThemes, ctx: GateContext): ThemeClusterFact[] {
  const out: ThemeClusterFact[] = [];
  for (const theme of parsed.themes) {
    const gated = gateTheme(theme, ctx);
    if (gated) out.push(gated);
  }
  if (parsed.affection_theme) {
    const gated = gateTheme(parsed.affection_theme, ctx);
    if (gated) out.push(gated);
  }
  return out;
}
