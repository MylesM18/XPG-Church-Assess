/**
 * Respondent-anonymity primitive, shared by the facts path (lib/report/facts.ts) and the
 * theme gate (lib/ai/theme-gates.ts).
 *
 * Scope, stated once so no caller over-trusts it: this matches EXACT FULL display labels,
 * case-insensitively, as substrings. Given the label 'Priscilla Vandermeer', the strings
 * 'Priscilla', 'Vandermeer' and 'P. Vandermeer' all pass. It is NOT a general PII filter —
 * the same limit lib/ai/prose.ts:117-121 documents for its own check 5. It is a backstop
 * against the specific failure of a person's collected name being reproduced verbatim, not
 * a guarantee of de-identification.
 *
 * It lives in lib/report rather than lib/ai on purpose: lib/report/facts.ts must import it,
 * and lib/report importing from lib/ai would invert the established layering. lib/report is
 * also linted, whereas lib/ai/** is under eslint globalIgnores.
 */

/**
 * Distinct, non-blank display labels across a run's responses.
 *
 * Blank labels are dropped deliberately, and this is the load-bearing line in the file:
 * '' is a substring of every string, so a single blank label reaching
 * containsRespondentLabel would make it return true for all input — every theme dropped,
 * every profile field omitted, with no error anywhere. Fail-closed must not degenerate
 * into fail-everything.
 *
 * Takes the minimal structural shape rather than Response so callers holding a narrower
 * row type (or a test fixture) need no cast.
 */
export function respondentLabels(
  responses: ReadonlyArray<{ respondent_label: string }>,
): string[] {
  const out = new Set<string>();
  for (const r of responses) {
    const label = r.respondent_label?.trim();
    if (label) out.add(label);
  }
  return [...out];
}

/** True iff `text` contains any of `labels` as a case-insensitive substring. */
export function containsRespondentLabel(text: string, labels: readonly string[]): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  for (const label of labels) {
    const needle = label?.trim().toLowerCase();
    if (needle && haystack.includes(needle)) return true;
  }
  return false;
}
