/**
 * The results-viewed email to XP Gathering (spec docs/superpowers/specs/2026-09-15-results-viewed-
 * email-design.md). The first time a church admin opens the report of a CLOSED run, kevin@xpgathering.com
 * gets one short summary: overall score, health stage, and each area's score. Church-level numbers only.
 *
 * Pure: the database claim / mark and the Resend send are injected, so every branch is testable and
 * the diagnosis page stays a single awaited call that can never throw into its render.
 */

export interface ResultsViewedArea {
  name: string
  score: number
}

export interface ResultsViewedSummary {
  churchName: string
  overallScore: number
  healthStage: string
  areas: ResultsViewedArea[]
}

export interface ResultsViewedSummaryInput {
  churchName: string
  /** The rendered report's cover: `score` is the overall score, `tierName` the health stage. */
  cover: { score: number; tierName: string }
  /** The diagnosis's per-area scores (`Diagnosis.categories`). */
  areaScores: ReadonlyArray<{ category_id: string; score: number }>
  /** The EFFECTIVE methodology's areas, for display names (the same edition the report renders). */
  areaNames: ReadonlyArray<{ id: string; name: string }>
}

/** The email's numbers, taken from the report the admin is looking at. Total: never throws. */
export function resultsViewedSummary(input: ResultsViewedSummaryInput): ResultsViewedSummary {
  const names = new Map(input.areaNames.map((area) => [area.id, area.name]))
  const areas = input.areaScores
    .map((area) => ({
      id: area.category_id,
      name: names.get(area.category_id) ?? area.category_id,
      score: area.score,
    }))
    // The report's own area order (lib/report/facts.ts): score high to low, ties by area id.
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ name, score }) => ({ name, score }))
  return {
    churchName: input.churchName,
    overallScore: input.cover.score,
    healthStage: input.cover.tierName,
    areas,
  }
}

export type ResultsViewedOutcome = 'skipped' | 'not_claimed' | 'sent' | 'send_failed' | 'error'

export interface NotifyResultsViewedInput {
  viewerIsAdmin: boolean
  /** `assessment_runs.status`: only `'complete'` (the admin closed the assessment) may send. */
  runStatus: string
  /** Lazy, so a builder failure is caught here instead of in the page render. */
  buildSummary: () => ResultsViewedSummary
}

export interface NotifyResultsViewedDeps {
  /** Server-only DB claim (a service-role RPC): true only for the one caller allowed to send right now. */
  claim: () => Promise<boolean>
  send: (summary: ResultsViewedSummary) => Promise<{ ok: boolean }>
  /** Records the successful send so no later view repeats it. */
  mark: () => Promise<boolean>
}

/** Runs `fn`, turning a throw into `fallback`, so no dependency can reject into the page. */
async function settle<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

/**
 * Gate (admin, closed run) → build the summary → claim → send → mark. Never rejects: every failure is
 * an outcome plus one reason-only warning. A failed send is left unmarked so a later admin view retries
 * after the 5-minute claim hold; a failed mark still counts as `sent` because the email went out.
 */
export async function notifyResultsViewed(
  input: NotifyResultsViewedInput,
  deps: NotifyResultsViewedDeps,
): Promise<ResultsViewedOutcome> {
  if (!input.viewerIsAdmin || input.runStatus !== 'complete') return 'skipped'

  const summary = await settle<ResultsViewedSummary | null>(() => input.buildSummary(), null)
  if (!summary) {
    console.warn('[notify] results-viewed email skipped: the summary could not be built')
    return 'error'
  }

  const claimed = await settle<boolean | null>(() => deps.claim(), null)
  if (claimed === null) {
    console.warn('[notify] results-viewed email skipped: the claim threw')
    return 'error'
  }
  if (!claimed) return 'not_claimed'

  const sent = await settle(async () => (await deps.send(summary)).ok === true, false)
  if (!sent) {
    console.warn('[notify] results-viewed email not sent; a later admin view retries after the claim hold')
    return 'send_failed'
  }

  const marked = await settle(() => deps.mark(), false)
  if (!marked) {
    console.warn('[notify] results-viewed email sent but not marked; it may repeat once after the claim hold')
  }
  return 'sent'
}
