import type { Theme } from '../methodology/schema';
import type { FactsPack } from './facts';

/**
 * Deterministic CONTENT blocks, the prose sibling of lib/report/charts.ts's geometry models.
 *
 * ⚠️ PURE. No JSX, no `@react-pdf/renderer` import, no DOM — imported by BOTH renderers.
 *
 * Why this module exists at all: `AssembledSection.fallback.bullets` is dropped the moment a
 * section's `source` is 'ai' (every AI renderer renders the model's own fields instead), so any
 * deterministic content parked in a bullet is invisible on the live path — s7 IS an AI section,
 * and prose is on whenever OPENAI_API_KEY is set. `charts` already solved this for geometry:
 * chartsForSection never reads `section.source`, so a chart cannot degrade when the model is
 * unavailable OR when it succeeds. Blocks are the same seam for content that is COMPUTED rather
 * than composed, and both renderers render them on both paths.
 *
 * Strings are composed HERE, once, not in the renderers: the two surfaces must print the same
 * sentence (the §5 prose-parity rule), and the structure — an area, then its own questions —
 * is what each renderer lays out. Renderers read `head`, `line`, `note`; they never rebuild a
 * sentence out of the numbers beside them.
 */

/** How many of an area's weak questions the punch list prints before it starts counting.
 *
 *  The list itself is uncapped by ruling — every area below the standard appears (Natalie,
 *  2026-08-19) — but its EVIDENCE is not the same promise. Against the real 50-question
 *  instrument a church scoring in the 50s and 60s puts nearly every question below 80, which is
 *  ~44 questions across 8 areas: as one semicolon-joined sentence per area that was ~6,100
 *  characters of run-on prose (s7's own AI ceiling is 1,200 for scale). `weak_items` is already
 *  sorted worst-first, so the first three ARE the evidence; the rest is volume. Nothing is
 *  hidden silently — `note` below always states how many were not printed. */
export const WEAK_ITEMS_SHOWN = 3;

export interface PunchListItem {
  item_id: string;
  /** `<question> — <mean> out of 100 (<theme>)`. One string, both surfaces. */
  line: string;
  theme: Theme;
}

export interface PunchListArea {
  category_id: string;
  name: string;
  score: number;
  gap_to_standard: number;
  /** `<Area> — <score> out of 100, <gap> points below the standard of <standard>.` */
  head: string;
  /** This area's own worst questions, at most WEAK_ITEMS_SHOWN of them. */
  items: PunchListItem[];
  /** The count of weak questions not printed, or the plain statement that an area below the
   *  standard has no individual question below it. Null when neither applies. */
  note: string | null;
}

export type PunchListBlock = {
  kind: 'punch_list';
  standard: number;
  /** The list's own lead line. It introduces itself because it CANNOT be introduced by s7's
   *  report.yaml template: that string is both the fallback body and the model's per-archetype
   *  system prompt (composeSection), and `SECTION_REGISTRY.s7.slice` hands the model only
   *  `bottom_items` + `pattern_counts` — no `improvement`, and no 80 for gate 2's numeric
   *  containment to allow. A template that described this list would be telling the model to
   *  write about facts it was never given. */
  heading: string;
  areas: PunchListArea[];
};

/** One entry today. A union so a second block kind needs no renderer re-plumbing, exactly as
 *  ChartModel is a union of three. */
export type SectionBlock = PunchListBlock;

/**
 * S7's punch list: every area below the improvement standard, worst first, each carrying its own
 * evidence. Natalie's ruling (2026-08-19) — no worst-N cap on the AREAS, and no thirteenth
 * section (the 13th slot she closed on 2026-08-16 stays closed).
 *
 * Null when nothing is below the standard: s7 then falls back to naming the six lowest questions
 * in its bullets, which is the only specific evidence it has left (see s7Bullets).
 */
export function punchListBlock(facts: FactsPack): PunchListBlock | null {
  const { standard, areas_needing_work } = facts.improvement;
  if (areas_needing_work.length === 0) return null;
  return {
    kind: 'punch_list',
    standard,
    heading: `Every area below the standard of ${standard}, weakest first.`,
    areas: areas_needing_work.map((a): PunchListArea => {
      const shown = a.weak_items.slice(0, WEAK_ITEMS_SHOWN);
      const hidden = a.weak_items.length - shown.length;
      return {
        category_id: a.category_id,
        name: a.name,
        score: a.score,
        gap_to_standard: a.gap_to_standard,
        head: `${a.name} — ${a.score} out of 100, ${a.gap_to_standard} points below the standard of ${standard}.`,
        items: shown.map((i) => ({
          item_id: i.item_id,
          line: `${i.text} — ${i.mean} out of 100 (${i.theme})`,
          theme: i.theme,
        })),
        // An area can sit below the standard with no question below it in live data, not only in
        // a fixture whose item map is thin: the AREA score is `mu` over respondents who answered
        // EVERY item in it (lib/engine/fit.ts's complete-rows rule), while item means are taken
        // over every response to that item (lib/report/facts.ts). Different respondent sets, so
        // the two can disagree. An empty list under a heading reads as a rendering bug, so say why.
        note:
          a.weak_items.length === 0
            ? 'No individual question in this area is below the standard.'
            : hidden > 0
              ? `And ${hidden} more ${hidden === 1 ? 'question' : 'questions'} in this area below the standard.`
              : null,
      };
    }),
  };
}
