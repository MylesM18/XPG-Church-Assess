import type { createClient } from '@/lib/supabase/server'
import { WAIT_PHRASE_DEFAULTS } from '@/lib/report/wait-phrases'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * How long the decorative read may take before it is abandoned for the shipped defaults.
 *
 * Every other await in the diagnosis Server Component is load-bearing — the page cannot render
 * without it — so a slow database costs the user the page either way. This one is not: it is
 * cosmetic copy that already has a local fallback, which makes it the one read that must never be
 * the reason a report is late. Short enough to be invisible next to the model call it introduces.
 */
export const WAIT_PHRASES_TIMEOUT_MS = 500

/**
 * The reassurance lines shown while the report model runs (feat/report-wait-experience).
 *
 * `public.report_wait_phrases` (migration 20260819000100) is the source of truth so the wording
 * can be changed in the Supabase dashboard without a deploy. It is app-wide copy — no church_id,
 * no respondent data, readable by any signed-in user.
 *
 * FAILS OPEN to WAIT_PHRASE_DEFAULTS in every degenerate case: the migration not applied yet
 * (the table simply does not exist), a transient read failure, a query that is SLOW or never
 * settles (see WAIT_PHRASES_TIMEOUT_MS), an empty table, or a table whose rows are all blank. The
 * alternative is a spinner beside an empty line, which reads as a hung page — the exact impression
 * this feature exists to remove. A genuine failure is named once
 * under `[report]`, reason only, matching lib/data/reports.ts's readPersistedReport; an EMPTY
 * table is a configuration state, not a failure, so it logs nothing.
 *
 * This is the only `.from('report_wait_phrases')` in the tree (ADR 0002: table strings live in
 * lib/data/*).
 */
export async function loadWaitPhrases(supabase: SupabaseServerClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('report_wait_phrases')
      .select('phrase')
      .eq('active', true)
      // `sort_order` is deliberately not unique, and Postgres gives no order among equal keys, so
      // two hand-edited rows sharing a value would shuffle between renders. `phrase` is unique, so
      // it is a total tie-breaker (created_at is not: the seed writes every row in one statement).
      .order('sort_order')
      .order('phrase')
      // Bounded: an unresponsive PostgREST must not hold up the page for decorative copy. The
      // abort surfaces as a rejection, which the catch below turns into the shipped defaults.
      .abortSignal(AbortSignal.timeout(WAIT_PHRASES_TIMEOUT_MS))

    if (error) {
      console.warn('[report] wait phrases read failed; using the shipped lines:', error.message)
      return [...WAIT_PHRASE_DEFAULTS]
    }

    const phrases = (data ?? [])
      .map((row) => (typeof row.phrase === 'string' ? row.phrase.trim() : ''))
      .filter((phrase) => phrase !== '')

    return phrases.length > 0 ? phrases : [...WAIT_PHRASE_DEFAULTS]
  } catch (err) {
    // A wait line may never break the diagnosis page render.
    console.warn(
      '[report] wait phrases read failed; using the shipped lines:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return [...WAIT_PHRASE_DEFAULTS]
  }
}
