/**
 * The plain-English rendering of a church profile, for anything a MODEL or a READER sees.
 *
 * ⚠️ PURE — no I/O, no methodology. The profile pack (lib/report/facts.ts buildFacts) carries
 * the database's own vocabulary: slug keys (`staff_fte_band`) and, for the four closed-vocab
 * selects, slug values (`growing_steadily`, `small_town`, `250_499`). That is storage
 * vocabulary, not English. It reached a live report verbatim because the s2 slice handed the
 * raw pack to the model under an instruction to use no name absent from the facts — so the
 * model dutifully wrote "In a growing_steadily, small_town setting ... how you steward
 * staff_fte_band and budget_band" (Natalie, 2026-08-19). A model cannot echo a slug it never
 * sees; the fix is at the seam, not in the prompt.
 *
 * Value labels are mapped ONLY for the four closed-vocabulary keys (the settings form's own
 * option sets, app/app/[churchId]/settings/settings-form.tsx). Free-text fields pass through
 * untouched — they are admin-typed prose, and a blanket underscore-replace would silently
 * rewrite it.
 */

/** Slug key -> what a reader calls it. Deliberately lower-case: these keys land inside a JSON
 *  facts slice the model quotes from, and "Weekend attendance (required)"-style form labels
 *  read as chrome there. */
export const PROFILE_KEY_LABELS: Record<string, string> = {
  context: 'setting',
  attendance_band: 'weekend attendance',
  denomination: 'denomination',
  adults_band: 'adults',
  staff_fte_band: 'staff',
  budget_band: 'annual budget',
  church_age_band: 'church age',
  campuses_band: 'campuses',
  growth_trajectory: 'growth trajectory',
  facility_status: 'facility',
  leadership_history: 'leadership history',
  consultant_notes: 'notes from the church',
};

/** The four closed-vocab selects' value labels, mirroring the settings form's option text in
 *  plain words ("250 to 499", not the form's en-dash "250–499" — the report bans en-dashes). */
const CLOSED_VALUE_LABELS: Record<string, Record<string, string>> = {
  context: { urban: 'urban', suburban: 'suburban', small_town: 'small town', rural: 'rural' },
  attendance_band: {
    under_100: 'under 100',
    '100_249': '100 to 249',
    '250_499': '250 to 499',
    '500_999': '500 to 999',
    '1000_1499': '1,000 to 1,499',
    '1500_plus': '1,500 or more',
  },
  growth_trajectory: {
    declining: 'declining',
    plateaued: 'plateaued',
    growing_steadily: 'growing steadily',
    growing_rapidly: 'growing rapidly',
  },
  facility_status: { owned: 'owned', rented: 'rented', portable: 'portable', mixed: 'mixed' },
};

/** One value in plain English. Closed-vocab keys map through their label table (an unknown slug
 *  degrades to underscores-as-spaces rather than leaking); free-text values pass through. */
export function plainProfileValue(key: string, value: string): string {
  const closed = CLOSED_VALUE_LABELS[key];
  if (!closed) return value;
  return closed[value] ?? value.replaceAll('_', ' ');
}

/** The whole profile in plain English — keys and values. A key this module has never heard of
 *  degrades to underscores-as-spaces, so a new profile column can never reintroduce a slug. */
export function profileInPlainEnglish(profile: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile)) {
    out[PROFILE_KEY_LABELS[key] ?? key.replaceAll('_', ' ')] = plainProfileValue(key, value);
  }
  return out;
}
