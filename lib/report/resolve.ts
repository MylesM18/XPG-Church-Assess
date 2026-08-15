import { buildFacts } from '@/lib/report/facts'
import type { ThemeClusterFact } from '@/lib/report/facts'
import { reportInputs } from '@/lib/report/inputs-hash'
import { assembleReport } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import { coverModel } from '@/lib/report/charts'
import type { CoverModel } from '@/lib/report/charts'
import type { PersistedReportLookup } from '@/lib/data/reports'

type ReportInputsArgs = Parameters<typeof reportInputs>[0]

/**
 * The one pipeline both report surfaces run: facts → inputs hash → hash-addressed read →
 * revalidate themes → rebuild facts with themes → assemble 13 sections.
 *
 * ⚠️ This module imports NO Supabase client. The read is injected as `readPersisted`, which is
 * what makes the whole pipeline unit-testable against a fake — and that is what finally gives
 * revalidatedThemes real coverage (D-P5-3). Importing a client here to "simplify" the callers
 * would silently un-test it.
 *
 * `reflections` and `hashReflections` are two different arrays from the same raw rows and must
 * not be swapped. `reflections` is KEYLESS (item_id + text) and is the only reflections data
 * that reaches a renderer. `hashReflections` CARRIES respondent identity and its sole consumer
 * is reportInputs — passing it to assembleReport or any component leaks respondent identity.
 */
export type ResolveReportSectionsArgs = Omit<ReportInputsArgs, 'reflections'> & {
  /** The keyless array — item_id + free text, no respondent identifier. Goes to assembleReport. */
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>
  /** The keyed array — respondent identity included. Goes to reportInputs and nowhere else. */
  hashReflections: ReportInputsArgs['reflections']
  readPersisted: (inputsHash: string) => Promise<PersistedReportLookup>
}

export interface ResolvedReportSections {
  sections: AssembledSection[]
  inputsHash: string
  /** A report exists for this run, but not for these inputs. Drives the D-P5-4 notice. */
  stale: boolean
  cover: CoverModel
}

export async function resolveReportSections(
  args: ResolveReportSectionsArgs,
): Promise<ResolvedReportSections> {
  const { reflections, hashReflections, readPersisted, ...inputs } = args

  const { inputsHash, baseFacts } = reportInputs({ ...inputs, reflections: hashReflections })

  const lookup = await readPersisted(inputsHash)
  const persisted = lookup.matched

  // A row for OTHER inputs exists. Not an error and not a crash — the deterministic sections
  // are still correct, so this renders fallbacks and tells the caller why.
  const stale = persisted === null && lookup.anyExists
  if (stale) console.warn('[report] persisted row stale; rendering fallbacks')

  // D-P4-1: facts.themes is model output that cannot be re-derived from responses, so S8 is the
  // one place a renderer reads model output back off the persisted row. The invariant narrows
  // rather than breaks: no renderer reads derived NUMBERS from `facts`; model output that cannot
  // be re-derived is read back, SCHEMA-REVALIDATED FIRST.
  const themes = revalidatedThemes(persisted, inputsHash)
  const facts = themes === null
    ? baseFacts
    : buildFacts({
        diagnosis: inputs.diagnosis,
        methodology: inputs.methodology,
        responses: inputs.responses,
        church: inputs.church,
        completedAt: inputs.completedAt,
        labelSource: inputs.labelSource,
        themes,
      })

  const sections = assembleReport({
    facts,
    methodology: inputs.methodology,
    reflections, // the KEYLESS array — never hashReflections
    persisted,
    liveInputsHash: inputsHash,
  })

  const cover = coverModel(facts, inputs.methodology)

  return { sections, inputsHash, stale, cover }
}

/**
 * Structural validator for ThemeClusterFact[] (lib/report/facts.ts). There is deliberately no
 * schema import here: ThemesSchema (lib/ai/themes.ts) validates the MODEL's RAW output —
 * `{ themes: ThemeSchema[], affection_theme }` where each ThemeSchema carries
 * `support_indices`/`verbatim_candidates` — not the post-processed ThemeClusterFact[] this
 * reads back off `facts.themes` (`support_count`/`verbatims`). The two shapes differ in both
 * wrapper (object vs array) and fields, so `ThemesSchema.safeParse(facts.themes)` would reject
 * every real row, always — a fail-closed bug that disables themes silently and is
 * indistinguishable from "no data yet" (see lib/ai/theme-gates.ts / clusterThemes's return
 * contract for where support_indices becomes support_count and verbatim_candidates becomes
 * verbatims). This checks the same required string/number keys ThemeClusterFact declares.
 */
function isThemeClusterFact(value: unknown): value is ThemeClusterFact {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.label === 'string' &&
    typeof t.gloss === 'string' &&
    typeof t.support_count === 'number' &&
    Array.isArray(t.item_ids) && t.item_ids.every((id) => typeof id === 'string') &&
    Array.isArray(t.verbatims) && t.verbatims.every((v) => typeof v === 'string')
  )
}

/**
 * Returns the persisted themes only when the row is FRESH and its themes revalidate.
 * On any failure — no row, stale hash, missing key, revalidation failure — returns null,
 * and facts.themes stays []. s8Bullets (lib/report/fallback-sections.ts:106-120) already
 * falls through to the per-area voices list built from the keyless reflections, so the
 * fallback needs no new code path.
 */
function revalidatedThemes(
  persisted: { inputs_hash: string; facts: unknown } | null,
  liveInputsHash: string,
): ThemeClusterFact[] | null {
  if (!persisted || persisted.inputs_hash !== liveInputsHash) return null
  const facts = persisted.facts
  if (!facts || typeof facts !== 'object' || !('themes' in facts)) return null
  const themes = (facts as { themes: unknown }).themes
  return Array.isArray(themes) && themes.every(isThemeClusterFact)
    ? (themes as ThemeClusterFact[])
    : null
}
