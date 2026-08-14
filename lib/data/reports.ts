import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * One persisted `reports` row, narrowed to the columns a renderer reads back.
 * `sections` and `facts` are untyped jsonb: a row outlives the code that wrote it, so both
 * are revalidated downstream (assembleReport re-parses `sections`; revalidatedThemes re-checks
 * `facts.themes`) and neither is ever trusted as-is.
 */
export interface PersistedReportRow {
  inputs_hash: string
  sections: unknown
  facts: unknown
}

/**
 * The result of a hash-addressed lookup.
 *
 * `matched` is the row for THESE inputs, or null. `anyExists` is "this run has some reports
 * row, of any hash" — the two together are what let a caller tell "never generated" apart from
 * "generated under different inputs". A single hash-addressed row cannot express that
 * difference on its own: it is either the right row or absent, so a staleness test written
 * against it alone can never fire.
 */
export interface PersistedReportLookup {
  matched: PersistedReportRow | null
  anyExists: boolean
}

/**
 * Reads the persisted report for `runId` **addressed by `inputsHash`** (D-P5-5).
 *
 * The pre-D-P5-5 read ordered by generated-at descending and took the top row — the newest row
 * whatever its inputs. That was harmless only while generation was one-shot per church. Plan 5 adds a
 * regenerate path, so the newest row can be for inputs the viewer has since reverted away from,
 * and the older row that DOES match would be invisible forever. Addressing by hash finds it.
 *
 * `(run_id, inputs_hash)` is unique, so `.maybeSingle()` is safe on the matched query.
 *
 * Every failure mode — RLS denial, a query error, no row — resolves to
 * `{ matched: null, anyExists: false }`. That is the same "no AI" input assembleReport already
 * handles, so every section renders its deterministic fallback. Reads through the anon-key RLS
 * client; no service role. `reports` RLS is admin-only select and both callers are admin-gated.
 */
export async function readPersistedReport(
  supabase: SupabaseServerClient,
  runId: string,
  inputsHash: string,
): Promise<PersistedReportLookup> {
  const { data: matched, error } = await supabase
    .from('reports')
    .select('inputs_hash, sections, facts')
    .eq('run_id', runId)
    .eq('inputs_hash', inputsHash)
    .maybeSingle()

  if (error) {
    // Reason only — never the row, the facts, or the sections.
    console.warn('[report] reports read failed; rendering fallback sections')
    return { matched: null, anyExists: false }
  }
  if (matched) return { matched: matched as PersistedReportRow, anyExists: true }

  // Only on a miss: is there a report for this run at ALL? This is what separates "this church
  // has never generated" (no notice) from "generated under different inputs" (stale → notice +
  // regenerate). Selecting a single non-jsonb column keeps it cheap.
  const { data: other } = await supabase
    .from('reports')
    .select('inputs_hash')
    .eq('run_id', runId)
    .limit(1)
    .maybeSingle()

  return { matched: null, anyExists: other !== null && other !== undefined }
}
