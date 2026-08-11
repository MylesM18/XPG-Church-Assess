import type { Diagnosis, GenerosityMode, Response } from '../engine/types';
import type { Methodology, Theme } from '../methodology/schema';
import { archetypeFor, tierFor, type Archetype, type Tier } from './tier';
import { interp } from './view';
import { containsRespondentLabel, respondentLabels } from './anonymity';

/**
 * The facts pack: the single deterministic source of every number, name, and theme any
 * report section — GPT-composed or fallback — is allowed to mention (spec "FACTS PACK
 * (every number originates here)"). JSON-serializable by construction: plain objects and
 * arrays only, because plan 3 persists it verbatim as `reports.facts jsonb` and hashes
 * slices of it into per-section gate inputs.
 *
 * Anonymity: respondent labels/ids never enter the pack — respondents exist here only as
 * the distinct count on the cover and the per-category counts.
 */
export interface CategoryFact {
  id: string;
  name: string;
  kind: 'stage' | 'enabler';
  score: number;
  state: string;
  percentile: number | null;
  respondent_count: number;
}

export interface BottomItemFact {
  item_id: string;
  category_id: string;
  mean: number; // 1–10 answers × 10, rounded to the nearest integer (0–100 register)
  text: string;
  theme: Theme;
}

/** Shape plan 2's gated clustering output lands in. Empty until plan 3 wires the caller. */
export interface ThemeClusterFact {
  label: string;
  gloss: string;
  /** Distinct supporting respondents, computed server-side. Never the model's own count. */
  support_count: number;
  item_ids: string[];
  /**
   * Substring-verified, label-free quotes, at most 200 chars each. Empty when the P3 writer
   * pool (<8 distinct reflection writers) forbids verbatims, or when no candidate survived
   * the gate. Required rather than optional so a renderer can never mistake "not gated yet"
   * for "gated and empty". These are structured fields on purpose: they flow facts -> the S8
   * renderer, which strips them by audience, and are never embedded in composed prose.
   */
  verbatims: string[];
}

/** Church profile inputs — the 12 nullable `churches` profile columns plus name. */
export interface ChurchFacts {
  name: string;
  denomination: string | null;
  context: string | null;
  attendance_band: string | null;
  adults_band: string | null;
  staff_fte_band: string | null;
  budget_band: string | null;
  church_age_band: string | null;
  growth_trajectory: string | null;
  campuses_band: string | null;
  facility_status: string | null;
  leadership_history: string | null;
  consultant_notes: string | null;
}

export interface FactsPack {
  cover: { church_name: string; completed_at: string | null; respondent_count: number };
  overall: { capacity: number; throughput: number; gap: number; tier: Tier };
  archetype: Archetype;
  categories: CategoryFact[]; // sorted score desc, ties by id asc — S3's dashboard order
  bottom_items: BottomItemFact[]; // mean asc, ties by item id asc, max 6 — S7's table
  pattern_counts: Record<Theme, number>; // over bottom_items; all four keys always present (S7 gate 5)
  themes: ThemeClusterFact[];
  profile: Record<string, string>; // non-null profile fields only — absent, not empty (decision 6)
  blind_spots: Array<{ category_id: string; name: string; belief: number; evidence: number; gap: number }>;
  dispersion: Array<{ category_id: string; name: string; spread: number }>;
  dependencies: Array<{
    from: string; to: string; kind: string;
    from_name: string; to_name: string;
    from_score: number; to_score: number;
    read_sentence: string;
  }>;
  gating: Array<{ enabler_id: string; name: string; score: number; note: string }>;
  generosity_mode: GenerosityMode;
  primary_constraint: { category_id: string; name: string } | null;
  confidence: number;
}

export interface BuildFactsArgs {
  diagnosis: Diagnosis;
  /** ALWAYS the effective edition (deriveDiagnosisForRun's effectiveMethodology) — the
   *  item→theme map and statement texts must match what the run was scored against. */
  methodology: Methodology;
  responses: Response[];
  church: ChurchFacts;
  completedAt: string | null;
  themes?: ThemeClusterFact[];
}

const PROFILE_KEYS = [
  'denomination', 'context', 'attendance_band', 'adults_band', 'staff_fte_band',
  'budget_band', 'church_age_band', 'growth_trajectory', 'campuses_band',
  'facility_status', 'leadership_history', 'consultant_notes',
] as const;

const BOTTOM_ITEM_COUNT = 6;

export function buildFacts(args: BuildFactsArgs): FactsPack {
  const { diagnosis: d, methodology, responses, church, completedAt } = args;
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const chainSet = new Set(methodology.rules.chain);

  // Bottom items: per-item means over the EFFECTIVE methodology's item list — an orphan
  // response for an item this edition no longer carries can never surface a phantom row.
  const byItem = new Map<string, number[]>();
  for (const r of responses) {
    const bucket = byItem.get(r.item_id);
    if (bucket) bucket.push(r.value);
    else byItem.set(r.item_id, [r.value]);
  }
  const itemFacts: BottomItemFact[] = [];
  for (const cat of methodology.questions.categories) {
    for (const item of cat.items) {
      const values = byItem.get(item.id);
      if (!values || values.length === 0) continue;
      const mean = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10);
      itemFacts.push({ item_id: item.id, category_id: cat.id, mean, text: item.text, theme: item.theme });
    }
  }
  const bottomItems = itemFacts
    .sort((a, b) => a.mean - b.mean || (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0))
    .slice(0, BOTTOM_ITEM_COUNT);

  const patternCounts: Record<Theme, number> = { systems: 0, culture: 0, theology: 0, relational: 0 };
  for (const b of bottomItems) patternCounts[b.theme] += 1;

  const categories: CategoryFact[] = d.categories
    .map((c) => ({
      id: c.category_id,
      name: names.get(c.category_id) ?? c.category_id,
      kind: (chainSet.has(c.category_id) ? 'stage' : 'enabler') as CategoryFact['kind'],
      score: c.score,
      state: c.state,
      percentile: c.cohort_percentile,
      respondent_count: c.respondent_count,
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const scores = new Map(d.categories.map((c) => [c.category_id, c.score]));

  // Fail-closed anonymity guard on the free-text profile fields. `leadership_history` and
  // `consultant_notes` are admin-authored prose copied verbatim into the pack, and plan 3's
  // composer puts the pack into a model prompt and onto the rendered report — so a name
  // typed here is a back door around every other anonymity control in the system. Drop the
  // offending FIELD rather than throwing: one over-shared note must not cost the report.
  // Prevention lives alongside this in the settings hint copy (settings-form.tsx).
  const labels = respondentLabels(responses);
  const profile: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const value = church[key];
    if (value === null || value.length === 0) continue;
    if (containsRespondentLabel(value, labels)) continue;
    profile[key] = value;
  }

  const primaryId = d.primary_constraint?.category_id ?? null;

  return {
    cover: {
      church_name: church.name,
      completed_at: completedAt,
      respondent_count: new Set(responses.map((r) => r.respondent_id)).size,
    },
    overall: {
      capacity: d.capacity,
      throughput: d.throughput,
      gap: d.gap,
      tier: tierFor(d.capacity, methodology.rules),
    },
    archetype: archetypeFor(d),
    categories,
    bottom_items: bottomItems,
    pattern_counts: patternCounts,
    themes: args.themes ?? [],
    profile,
    blind_spots: d.blind_spots.map((b) => ({
      category_id: b.category_id,
      name: names.get(b.category_id) ?? b.category_id,
      belief: b.belief,
      evidence: b.evidence,
      gap: b.gap,
    })),
    dispersion: d.disagreement_flags.map((f) => ({
      category_id: f.category_id,
      name: names.get(f.category_id) ?? f.category_id,
      spread: f.spread,
    })),
    dependencies: d.dependencies.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      from_name: names.get(e.from) ?? e.from,
      to_name: names.get(e.to) ?? e.to,
      from_score: e.fromScore,
      to_score: e.toScore,
      // Same template + interp buildSystem uses, so the report and the dossier
      // surfaces can never phrase a dependency differently.
      read_sentence: interp(methodology.copy.dependency_reads[e.read], {
        fromName: names.get(e.from) ?? e.from,
        toName: names.get(e.to) ?? e.to,
      }),
    })),
    gating: d.gating_conditions.map((g) => ({
      enabler_id: g.enabler_id,
      name: names.get(g.enabler_id) ?? g.enabler_id,
      score: scores.get(g.enabler_id) ?? 0,
      note: g.note,
    })),
    generosity_mode: d.generosity_mode,
    primary_constraint: primaryId
      ? { category_id: primaryId, name: names.get(primaryId) ?? primaryId }
      : null,
    confidence: d.confidence,
  };
}
