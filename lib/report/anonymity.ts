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
 * ⚠️ Caller precondition — the rows must carry UNREDACTED labels. The share RPC
 * (supabase/migrations/20260728000400_rpc_get_shared_run_responses.sql:48) returns
 * respondent_label as ''::text, and blanks are dropped above, so share-path rows yield []
 * here and every guard keyed off this list becomes a silent no-op. A caller building a facts
 * pack on the share path must source labels from a non-redacted query instead.
 *
 * Takes the minimal structural shape rather than Response so callers holding a narrower
 * row type (or a test fixture) need no cast.
 */
/**
 * The submit RPCs' nameless fallback (submit_self_response coalesces a profile with no
 * full_name and no email to the literal 'Member' —
 * supabase/migrations/20260716000900_submit_rpcs_bounds_guard.sql:96). Excluded below for the
 * SAME reason blanks are, not a relaxation of the guard: this placeholder is the system's own
 * word, it identifies nobody, and as a substring needle it matches the report's own vocabulary
 * ("staff member", "whoever remembers" — methodology/questions.yaml item text), so one nameless
 * respondent made every label guard fire at once — the PDF export refused to render its own
 * chart strings, and the reflection screen dropped "as a member of the youth group". A real
 * name is NEVER excluded here; only the exact placeholder, trimmed and case-insensitive.
 */
const PLACEHOLDER_LABELS = new Set(['member']);

export function respondentLabels(
  responses: ReadonlyArray<{ respondent_label: string }>,
): string[] {
  const out = new Set<string>();
  for (const r of responses) {
    const label = r.respondent_label?.trim();
    if (label && !PLACEHOLDER_LABELS.has(label.toLowerCase())) out.add(label);
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

/**
 * Where a caller's respondent labels came from, as a value the compiler can check.
 *
 * `{kind:'known'}` — the caller read real labels (get_run_responses). An EMPTY list here is a
 * deliberate statement that this run genuinely has no labels, not an accident.
 * `{kind:'redacted'}` — the caller's rows came from a surface that redacts labels, i.e. the
 * share RPC (supabase/migrations/20260728000400_rpc_get_shared_run_responses.sql:48 emits
 * ''::text). No label list exists, so no label-based guard can be enforced, so consumers must
 * fail closed rather than run a guard that can never fire.
 *
 * This union exists because the old contract — a bare `string[]` — made those two cases
 * indistinguishable: the share path yielded `[]` and every guard downstream became a silent
 * no-op. Removing an arm to reintroduce that is now a compile error.
 */
export type LabelSource = { kind: 'known'; labels: string[] } | { kind: 'redacted' };

/**
 * The constructor callers reach for. respondentLabels() survives as the primitive behind it
 * (and keeps its caller-precondition comment at :26-31), but is no longer the entry point.
 */
export function knownLabels(rows: ReadonlyArray<{ respondent_label: string }>): LabelSource {
  return { kind: 'known', labels: respondentLabels(rows) };
}
