import { describe, it, expect } from 'vitest'
import { validateCategoryAnswers, validateSingleAnswer } from '@/lib/answers/validate'
import type { Category } from '@/lib/methodology/schema'

// Exactly two items: G1 has no reflection prompt, G6 does. validateCategoryAnswers requires a
// complete set (answers.length === itemIds.length), so the fixture stays at two items to match
// the two-answer batches exercised below.
const guest: Category = {
  id: 'guest',
  name: 'Guest Experience',
  kind: 'stage',
  position: 1,
  items: [
    { id: 'G1', text: 'q1', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
    { id: 'G6', text: 'q6', signal: 'evidence', since: '0.3.0', anchors: { lo: 'l', mid: 'm', hi: 'h' }, reflection: 'Tell us.' },
  ],
}
const CATS = [guest]

describe('validateSingleAnswer reflection', () => {
  it('carries a reflection through untrimmed', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '  hi  ' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('  hi  ')
  })

  it('omits reflection when absent, leaving no undefined-valued key', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G1', value: 3 }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.answer.reflection).toBeUndefined()
      // Catches `{ ..., reflection: rawReflection }` unconditionally (key present, value
      // undefined) as opposed to the required conditional spread (key absent entirely).
      expect('reflection' in r.answer).toBe(false)
    }
  })

  it('accepts an empty string (the server nullifies it, not the client)', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('')
  })

  it('accepts whitespace-only text, carried through untouched', () => {
    // trim().length is 0, so this must pass the length check; the value itself must NOT be
    // normalized by the client (that is the server's nullif(btrim(...), '') job).
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '   ' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('   ')
  })

  it('rejects a non-string reflection', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: 42 }, CATS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/text/i)
  })

  it('rejects a reflection longer than 2000 characters after trimming', () => {
    const long = `  ${'x'.repeat(2001)}  ` // trimmed length 2001, raw length 2005
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: long }, CATS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/2000/)
  })

  it('accepts exactly 2000 characters', () => {
    const at = 'x'.repeat(2000)
    expect(validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: at }, CATS).ok).toBe(true)
  })

  it('measures length after trimming, not before: 1990 real chars padded past 2000 raw stays valid', () => {
    // trimmed length 1990 (valid); raw length 2010 (would wrongly fail an untrimmed check)
    const padded = `${' '.repeat(10)}${'x'.repeat(1990)}${' '.repeat(10)}`
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: padded }, CATS)
    expect(r.ok).toBe(true)
  })

  // The server's guard is char_length(btrim(reflection)) > 2000, and Postgres btrim()'s default
  // character set is ASCII space (0x20) ONLY — unlike JS .trim(), which also strips \n, \t, \r,
  // and other Unicode whitespace. A guard written as rawReflection.trim().length would therefore
  // be strictly LOOSER than the server for any padding built from non-space whitespace: it would
  // accept text the RPC then rejects with a raw Postgres error. 2000 'x's plus one trailing
  // newline is exactly that case: raw length 2001, JS-trimmed length 2000 (wrongly under the
  // cap), ASCII-space-trimmed length 2001 (correctly over it).
  it('rejects 2000 characters padded with a trailing newline (mirrors Postgres btrim, not JS .trim)', () => {
    const withNewline = 'x'.repeat(2000) + '\n'
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: withNewline }, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects 2000 characters padded with a leading tab, for the same reason', () => {
    const withTab = '\t' + 'x'.repeat(2000)
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: withTab }, CATS)
    expect(r.ok).toBe(false)
  })
})

describe('validateCategoryAnswers reflection', () => {
  const all = [
    { item_id: 'G1', value: 3 },
    { item_id: 'G6', value: 7, reflection: 'hello' },
  ]

  it('carries reflections through on the whole-category path, omitting the key where absent', () => {
    const r = validateCategoryAnswers('guest', all, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.answers.find((a) => a.item_id === 'G6')?.reflection).toBe('hello')
      const g1 = r.answers.find((a) => a.item_id === 'G1')
      expect(g1?.reflection).toBeUndefined()
      expect(g1 && 'reflection' in g1).toBe(false)
    }
  })

  it('rejects an over-long reflection anywhere in the batch', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 'x'.repeat(2001) }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })

  it('rejects a non-string reflection anywhere in the batch', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 42 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })

  // validateCategoryAnswers carries its own, independently-written copy of the reflection guard
  // (not a shared call into validateSingleAnswer), so every boundary case above needs a batch-path
  // sibling — otherwise a regression introduced only here (e.g. `>` slipping to `>=`, or the
  // btrim-mirror fix landing in one function but not the other) would be caught on one path and
  // pass silently on the other.

  it('accepts exactly 2000 characters on the batch path', () => {
    const at = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 'x'.repeat(2000) }]
    expect(validateCategoryAnswers('guest', at, CATS).ok).toBe(true)
  })

  it('measures length after trimming, not before, on the batch path too', () => {
    const padded = `${' '.repeat(10)}${'x'.repeat(1990)}${' '.repeat(10)}` // trimmed 1990, raw 2010
    const batch = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: padded }]
    expect(validateCategoryAnswers('guest', batch, CATS).ok).toBe(true)
  })

  it('carries whitespace-only text through untouched on the batch path too', () => {
    const batch = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: '   ' }]
    const r = validateCategoryAnswers('guest', batch, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answers.find((a) => a.item_id === 'G6')?.reflection).toBe('   ')
  })

  it('rejects 2000 characters padded with a trailing newline anywhere in the batch (btrim mirror)', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 'x'.repeat(2000) + '\n' }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })
})
