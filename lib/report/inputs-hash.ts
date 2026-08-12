import type { ChurchProfile } from '@/lib/data/churches'
import type { LabelSource } from '@/lib/report/anonymity'
import { buildFacts } from '@/lib/report/facts'
import type { BuildFactsArgs, ChurchFacts, FactsPack } from '@/lib/report/facts'
import { reportInputsHash } from '@/lib/report/report-hash'

/**
 * The raw run-response row shape both surfaces already have in hand.
 * Structural subset of what get_completed_run_responses returns — the module never
 * touches Supabase itself, so it stays pure and unit-testable.
 */
export interface ReflectionSourceRow {
  item_id: string
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

/**
 * item_id + respondent_key + trimmed text, non-empty only. `respondent_key` is the STABLE
 * identity: respondent_user_id ?? respondent_label — a renamed respondent must not change
 * the hash, but a different respondent must.
 *
 * ⚠️ ANONYMITY: the array this returns CARRIES RESPONDENT IDENTITY. Its only legitimate
 * consumer is reportInputs (i.e. the hash). It must never be passed to fallbackSections,
 * assembleReport, a component, or any client boundary. See the sibling keyless array on
 * app/app/[churchId]/diagnosis/page.tsx.
 *
 * Extracted verbatim from app/app/[churchId]/actions.ts:204-210.
 */
export function reflectionRowsFor(
  rows: readonly ReflectionSourceRow[],
): Array<{ item_id: string; respondent_key: string; text: string }> {
  const out: Array<{ item_id: string; respondent_key: string; text: string }> = []
  for (const row of rows) {
    const text = (row.reflection ?? '').trim()
    if (text === '') continue
    out.push({
      item_id: row.item_id,
      respondent_key: row.respondent_user_id ?? row.respondent_label,
      text,
    })
  }
  return out
}

/**
 * Every profile column at null. Typed with `satisfies` so tsc — not a human — proves the
 * key list matches ChurchFacts. If lib/report/facts.ts gains or renames a column, this
 * fails to compile instead of silently hashing a short profile.
 */
const NULL_PROFILE_COLUMNS = {
  denomination: null,
  context: null,
  attendance_band: null,
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: null,
  campuses_band: null,
  facility_status: null,
  leadership_history: null,
  consultant_notes: null,
} satisfies Omit<ChurchFacts, 'name'>

/**
 * The single ChurchProfile → ChurchFacts mapping, shared by generation and render so the
 * `profile` component of the inputs hash cannot drift between them (spec §4.3).
 *
 * `fallbackName` legitimately differs per call site: generation passes '' (bit-identity
 * with the pre-plan-4 `church?.name ?? ''`), the diagnosis page passes the real church
 * name. `name` is not part of `profile`, so it cannot affect the hash — but it IS
 * facts.cover.church_name, which S1 renders.
 *
 * ChurchFacts is structurally Omit<ChurchProfile, 'id'>, so this is a rest-spread rather
 * than a 13-line hand-copy: tsc fails loudly if the two type lists ever drift.
 */
export function churchFactsFrom(
  profile: ChurchProfile | null,
  fallbackName: string,
): ChurchFacts {
  if (!profile) return { name: fallbackName, ...NULL_PROFILE_COLUMNS }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...facts } = profile
  return { ...facts, name: facts.name ?? fallbackName }
}

/**
 * Owns the assembly of all six inputs-hash components, so the only way the two call sites
 * can disagree is by passing different `responses`, `church` or `reflections` — all of
 * which tests/report/inputs-hash-parity.test.ts pins directly.
 *
 * `responseHash` is NOT recomputed here (callers pass it). `baseFacts` is returned so
 * neither caller rebuilds it. Extracted verbatim from actions.ts:212-231.
 */
export function reportInputs(args: {
  diagnosis: BuildFactsArgs['diagnosis']
  methodology: BuildFactsArgs['methodology']
  responses: BuildFactsArgs['responses']
  church: ChurchFacts
  completedAt: string | null
  labelSource: LabelSource
  responseHash: string
  reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>
}): { inputsHash: string; baseFacts: FactsPack } {
  const baseFacts = buildFacts({
    diagnosis: args.diagnosis,
    methodology: args.methodology,
    responses: args.responses,
    church: args.church,
    completedAt: args.completedAt,
    labelSource: args.labelSource,
  })

  const inputsHash = reportInputsHash({
    methodologyVersion: args.diagnosis.methodology_version,
    responseHash: args.responseHash,
    methodology: args.methodology,
    reflections: args.reflections,
    profile: baseFacts.profile,
    reportVersion: args.methodology.report.version,
  })

  return { inputsHash, baseFacts }
}
