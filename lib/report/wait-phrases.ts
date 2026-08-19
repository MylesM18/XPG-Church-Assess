// The reassurance line the diagnosis page reveals beside a spinner while the report model runs
// (feat/report-wait-experience). Generation takes ~45-60 s in the common case and up to ~3.5 min
// at the fan-out's worst (clusterThemes + 11 compose units × 2 rounds), which is long enough that
// a bare disabled button reads as a broken page.
//
// PURE on purpose. The repo has no jsdom/RTL (standing decision), so a source-reading test of the
// client component could not tell a working reveal from a stuck one. Everything with an off-by-one
// or a divide-by-zero in it — word arithmetic, wrap-around, reduced motion, an empty list — lives
// here and is unit-tested for real (tests/report/wait-phrases.test.ts). The component owns only
// one useState and one self-rescheduling setTimeout.
//
// These lines are DECORATIVE: the component renders them aria-hidden, and the single stable
// "Writing your report with the model…" announcement stays in the <LiveStatus> region. A rotating
// live region would re-announce on every word, which is worse than silence for a screen reader.

/** Longest a phrase may be before it starts reflowing the notice on a narrow viewport. */
export const WAIT_PHRASE_MAX_CHARS = 72
/** Gap between revealed words. */
export const WAIT_WORD_MS = 110
/** Pause on a fully revealed phrase before moving to the next. */
export const WAIT_HOLD_MS = 2600

/**
 * The shipped list. `public.report_wait_phrases` (migration 20260819000100) is the source of
 * truth when it has rows, so Natalie can reword these in the Supabase dashboard without a deploy;
 * these are what render until then — the migration is applied by hand, and on this project that
 * has historically lagged the merge, so the feature must not depend on it to work at all.
 *
 * Honest about the pipeline rather than inventing progress: 1-2 are the reflection clustering
 * (lib/ai/themes.ts), 3-5 the section composition and its fact-check gates (lib/ai/sections.ts,
 * lib/ai/section-gates.ts), and none of them claims a percentage or a step count, because the
 * app has no progress signal to report.
 */
export const WAIT_PHRASE_DEFAULTS: readonly string[] = [
  'Reading every answer your team gave.',
  'Listening to what your leaders wrote in their own words.',
  'Looking for where the eight areas agree, and where they differ.',
  'Finding the one constraint holding the others back.',
  'Checking every sentence against your real numbers.',
  'Your scores are already set. The model only writes them up.',
  'Putting your strengths where you will see them first.',
  'Naming the next step, not the whole mountain.',
  'This usually takes about a minute.',
  'Reading it back once more before handing it over.',
  'Thank you for your patience.',
]

export interface WaitPhraseState {
  /** Index into the phrase list. */
  readonly phrase: number
  /** How many words of that phrase are revealed. */
  readonly words: number
}

const IDLE: WaitPhraseState = { phrase: 0, words: 0 }

/** Words of a phrase, whitespace-normalised. A blank phrase has none. */
function words(phrase: string): string[] {
  const trimmed = phrase.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** How many words a phrase has. 0 for blank, so a blank row can never stall the machine. */
export function wordCount(phrase: string): number {
  return words(phrase).length
}

/** The first `count` words of `phrase`, joined by single spaces. Clamped at both ends. */
export function revealWords(phrase: string, count: number): string {
  if (count <= 0) return ''
  return words(phrase).slice(0, count).join(' ')
}

/** Where the reveal starts. Under reduced motion the first phrase is already whole. */
export function initialWaitState(phrases: readonly string[], reduced: boolean): WaitPhraseState {
  if (phrases.length === 0) return IDLE
  return { phrase: 0, words: reduced ? wordCount(phrases[0] ?? '') : 0 }
}

/**
 * One tick.
 *
 * Mid-phrase: reveal one more word. On a complete phrase (including a blank one, which is
 * complete at zero words): move to the next, wrapping at the end — the wait can outlast the list.
 * Under reduced motion there is no per-word stage at all: every tick is a whole new phrase.
 * An out-of-range index resets to the start, so a list that shrinks between renders recovers.
 */
export function stepWaitState(
  state: WaitPhraseState,
  phrases: readonly string[],
  reduced: boolean,
): WaitPhraseState {
  if (phrases.length === 0) return IDLE
  const current = phrases[state.phrase]
  if (current === undefined) return initialWaitState(phrases, reduced)

  if (!reduced && state.words < wordCount(current)) {
    return { phrase: state.phrase, words: state.words + 1 }
  }

  const next = (state.phrase + 1) % phrases.length
  return { phrase: next, words: reduced ? wordCount(phrases[next] ?? '') : 0 }
}

/** How long to wait before the next tick. */
export function waitDelayMs(
  state: WaitPhraseState,
  phrases: readonly string[],
  reduced: boolean,
): number {
  if (reduced || phrases.length === 0) return WAIT_HOLD_MS
  const current = phrases[state.phrase]
  if (current === undefined) return WAIT_HOLD_MS
  return state.words < wordCount(current) ? WAIT_WORD_MS : WAIT_HOLD_MS
}
