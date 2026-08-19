/**
 * The improvement layer: how a church's eight areas rank against the standard Natalie set
 * on 2026-08-19 — "anything below 80 is major room for improvement".
 *
 * This sits ABOVE the engine and never touches it. `methodology/rules.yaml`'s thresholds
 * still decide `CategoryState` (broken/gate/watch/ok) and every band the charts colour by;
 * this module only answers the three questions the dashboard and the areas-needing-work
 * section ask. Keeping it separate is what lets the report speak plainly about an 80 bar
 * without re-scoring anyone.
 *
 * Why `strongestAreas` is RELATIVE while the other two are absolute: on a mid-range church
 * (every area in the 50s and 60s) nothing clears 80, so an absolute "strengths" count is
 * structurally 0 no matter where the bar sits — the tile is the wrong question, not the
 * wrong threshold. Section 05 already prints three named strengths for exactly this reason;
 * the top-3 floor here is what keeps the dashboard from contradicting it.
 *
 * Pure and total: no I/O, no methodology, no mutation of the caller's array. Every function
 * sorts defensively rather than trusting `buildFacts`'s score-desc order, so a caller that
 * hands over categories in any order gets the same answer.
 */

/** Natalie, 2026-08-19: "anything below 80 is major room for improvement". */
export const IMPROVEMENT_STANDARD = 80;

/** How many areas the dashboard's priority tile and the strongest-areas floor consider. */
const RANK_COUNT = 3;

/** The minimum a category must carry to be ranked. Structural, so callers can pass a
 *  `CategoryFact`, a facts-pack summary row, or a test stub without an adapter. */
export interface RankableCategory {
  id: string;
  score: number;
}

const byScoreAsc = <T extends RankableCategory>(a: T, b: T): number =>
  a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byScoreDesc = <T extends RankableCategory>(a: T, b: T): number =>
  b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every area below the standard, worst first. All eight on a mid-range church — the
 *  areas-needing-work section ranks them and never caps the list. */
export function needsWork<T extends RankableCategory>(categories: readonly T[]): T[] {
  return [...categories].filter((c) => c.score < IMPROVEMENT_STANDARD).sort(byScoreAsc);
}

/** The areas at or above the standard, or the top three when fewer than three clear it —
 *  whichever set is larger. Best first. Never empty for a church with any areas at all. */
export function strongestAreas<T extends RankableCategory>(categories: readonly T[]): T[] {
  const ranked = [...categories].sort(byScoreDesc);
  const clearing = ranked.filter((c) => c.score >= IMPROVEMENT_STANDARD).length;
  return ranked.slice(0, Math.max(clearing, RANK_COUNT));
}

/** The worst three, but only the ones actually below the standard, worst first. A church
 *  whose weakest three all clear 80 has no priority areas — the tile reads 0 honestly. */
export function priorityAreas<T extends RankableCategory>(categories: readonly T[]): T[] {
  return needsWork(categories).slice(0, RANK_COUNT);
}
