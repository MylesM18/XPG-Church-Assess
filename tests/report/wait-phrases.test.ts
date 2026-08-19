import { describe, expect, it } from 'vitest'
import {
  WAIT_HOLD_MS,
  WAIT_PHRASE_DEFAULTS,
  WAIT_PHRASE_MAX_CHARS,
  WAIT_WORD_MS,
  initialWaitState,
  revealWords,
  stepWaitState,
  waitDelayMs,
  wordCount,
} from '@/lib/report/wait-phrases'

/**
 * The report can take ~45-60 s (worst case ~3.5 min: clusterThemes + 11 compose units × 2 rounds),
 * so the diagnosis page reveals a rotating line of reassurance beside a spinner while it runs
 * (feat/report-wait-experience). The reveal is a pure state machine so it can be tested for real:
 * the repo has no jsdom/RTL (standing decision, tests/a11y/unmount-focus.test.ts header), and a
 * source-reading test of the component alone could not tell a working reveal from a stuck one.
 *
 * The React shell is a thin caller — one `useState` and one self-rescheduling `setTimeout` — and
 * everything that could be WRONG (word arithmetic, wrap-around, reduced-motion, empty input) lives
 * here.
 */

describe('wordCount / revealWords', () => {
  it('counts the words of a phrase', () => {
    expect(wordCount('Reading every answer')).toBe(3)
    expect(wordCount('One')).toBe(1)
  })

  it('is 0 for an empty or whitespace-only phrase, so a blank row cannot make the machine stall', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   ')).toBe(0)
  })

  it('reveals the first n words, joined by single spaces', () => {
    expect(revealWords('Reading every answer', 0)).toBe('')
    expect(revealWords('Reading every answer', 1)).toBe('Reading')
    expect(revealWords('Reading every answer', 2)).toBe('Reading every')
    expect(revealWords('Reading every answer', 3)).toBe('Reading every answer')
  })

  it('clamps: more words than the phrase has reveals the whole phrase, negative reveals nothing', () => {
    expect(revealWords('Reading every answer', 99)).toBe('Reading every answer')
    expect(revealWords('Reading every answer', -1)).toBe('')
  })

  it('collapses irregular whitespace so a phrase pasted with a line break reveals cleanly', () => {
    expect(revealWords('Reading   every\nanswer', 2)).toBe('Reading every')
  })
})

describe('initialWaitState', () => {
  const phrases = ['one two', 'three']

  it('starts at the first phrase with nothing revealed', () => {
    expect(initialWaitState(phrases, false)).toEqual({ phrase: 0, words: 0 })
  })

  it('under reduced motion starts with the first phrase FULLY revealed — no per-word animation at all', () => {
    expect(initialWaitState(phrases, true)).toEqual({ phrase: 0, words: 2 })
  })

  it('survives an empty phrase list (the table could be empty and the defaults overridden away)', () => {
    expect(initialWaitState([], false)).toEqual({ phrase: 0, words: 0 })
    expect(initialWaitState([], true)).toEqual({ phrase: 0, words: 0 })
  })
})

describe('stepWaitState', () => {
  const phrases = ['one two three', 'four five']

  it('reveals one more word while the current phrase is incomplete', () => {
    expect(stepWaitState({ phrase: 0, words: 0 }, phrases, false)).toEqual({ phrase: 0, words: 1 })
    expect(stepWaitState({ phrase: 0, words: 1 }, phrases, false)).toEqual({ phrase: 0, words: 2 })
  })

  it('advances to the next phrase, unrevealed, once the current one is complete', () => {
    expect(stepWaitState({ phrase: 0, words: 3 }, phrases, false)).toEqual({ phrase: 1, words: 0 })
  })

  it('wraps back to the first phrase after the last — the wait can outlast the list', () => {
    expect(stepWaitState({ phrase: 1, words: 2 }, phrases, false)).toEqual({ phrase: 0, words: 0 })
  })

  it('under reduced motion jumps straight to the next phrase, fully revealed — never a partial line', () => {
    expect(stepWaitState({ phrase: 0, words: 3 }, phrases, true)).toEqual({ phrase: 1, words: 2 })
    expect(stepWaitState({ phrase: 1, words: 2 }, phrases, true)).toEqual({ phrase: 0, words: 3 })
  })

  it('is a no-op on an empty list rather than dividing by zero or indexing undefined', () => {
    expect(stepWaitState({ phrase: 0, words: 0 }, [], false)).toEqual({ phrase: 0, words: 0 })
  })

  it('recovers from an out-of-range phrase index (the list can shrink between renders)', () => {
    expect(stepWaitState({ phrase: 9, words: 0 }, phrases, false)).toEqual({ phrase: 0, words: 0 })
  })

  it('skips a blank phrase instead of stalling on it forever', () => {
    // wordCount('') === 0, so the phrase is already "complete" and the machine must move on.
    expect(stepWaitState({ phrase: 0, words: 0 }, ['', 'four five'], false)).toEqual({ phrase: 1, words: 0 })
  })
})

describe('waitDelayMs', () => {
  const phrases = ['one two three', 'four five']

  it('ticks fast between words and pauses on a completed phrase so it can be read', () => {
    expect(waitDelayMs({ phrase: 0, words: 1 }, phrases, false)).toBe(WAIT_WORD_MS)
    expect(waitDelayMs({ phrase: 0, words: 3 }, phrases, false)).toBe(WAIT_HOLD_MS)
  })

  it('always holds under reduced motion — there is no per-word tick to schedule', () => {
    expect(waitDelayMs({ phrase: 0, words: 3 }, phrases, true)).toBe(WAIT_HOLD_MS)
    expect(waitDelayMs({ phrase: 0, words: 0 }, phrases, true)).toBe(WAIT_HOLD_MS)
  })

  it('holds on an empty list rather than scheduling a busy no-op loop', () => {
    expect(waitDelayMs({ phrase: 0, words: 0 }, [], false)).toBe(WAIT_HOLD_MS)
  })

  it('the word tick is faster than the hold, or the reveal would read as stalled', () => {
    expect(WAIT_WORD_MS).toBeLessThan(WAIT_HOLD_MS)
  })
})

describe('a full run through the machine', () => {
  it('reveals phrase 1 word by word, holds, then reveals phrase 2 — and comes back round', () => {
    const phrases = ['one two', 'three']
    const seen: string[] = []
    let state = initialWaitState(phrases, false)
    for (let i = 0; i < 8; i++) {
      seen.push(revealWords(phrases[state.phrase] ?? '', state.words))
      state = stepWaitState(state, phrases, false)
    }
    expect(seen).toEqual(['', 'one', 'one two', '', 'three', '', 'one', 'one two'])
  })
})

describe('WAIT_PHRASE_DEFAULTS', () => {
  it('ships a usable list, so the feature works before the DB table exists', () => {
    expect(WAIT_PHRASE_DEFAULTS.length).toBeGreaterThanOrEqual(8)
  })

  it('every default is trimmed, non-empty, and short enough not to reflow the notice', () => {
    for (const phrase of WAIT_PHRASE_DEFAULTS) {
      expect(phrase).toBe(phrase.trim())
      expect(phrase.length).toBeGreaterThan(0)
      expect(phrase.length).toBeLessThanOrEqual(WAIT_PHRASE_MAX_CHARS)
    }
  })

  it('has no duplicates — a repeat inside one wait reads as a stuck screen', () => {
    expect(new Set(WAIT_PHRASE_DEFAULTS).size).toBe(WAIT_PHRASE_DEFAULTS.length)
  })

  it('promises no fake progress: no percentages, no step counters, no completion claims', () => {
    // These lines are shown while the model runs; the app has no progress signal to report, so
    // anything implying measured progress would be an invention.
    for (const phrase of WAIT_PHRASE_DEFAULTS) {
      expect(phrase).not.toMatch(/\d+\s*%/)
      expect(phrase).not.toMatch(/step \d/i)
      expect(phrase).not.toMatch(/\b(?:done|complete|finished)\b/i)
    }
  })

  it('keeps the methodology promise that the model never decides the numbers', () => {
    const all = WAIT_PHRASE_DEFAULTS.join(' ').toLowerCase()
    expect(all).toContain('already')
    expect(all).not.toMatch(/\bdeciding\b|\bscoring you\b|\bjudging\b/)
  })
})
