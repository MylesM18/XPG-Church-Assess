import type { Methodology } from './schema';

export const OUTREACH_VERSION = '0.3.0';
export const PRE_OUTREACH_VERSION = '0.2.0';

/**
 * null (pre-stamping runs) predates; otherwise a plain string compare —
 * the spec's §Migration sanctions lexicographic compare for these version values.
 */
export function predatesOutreach(version: string | null): boolean {
  if (version === null) return true;
  return version < OUTREACH_VERSION;
}

/**
 * Non-predating runs get the SAME reference back (identity matters: derive tests
 * assert reference equality, and responseHash/save_diagnosis see identical input).
 * Predating runs get a deep-filtered copy — keep an item iff it has no `since`,
 * or the run's version is >= it — stamped PRE_OUTREACH_VERSION ('0.2.0' names the
 * test edition, not the run's birthday). The filter drops items, never categories.
 */
export function effectiveMethodologyForRun(
  methodology: Methodology,
  runVersion: string | null,
): Methodology {
  if (!predatesOutreach(runVersion)) return methodology;
  return {
    ...methodology,
    questions: {
      ...methodology.questions,
      version: PRE_OUTREACH_VERSION,
      categories: methodology.questions.categories.map((c) => ({
        ...c,
        items: c.items.filter((i) => i.since == null || (runVersion !== null && runVersion >= i.since)),
      })),
    },
  };
}
