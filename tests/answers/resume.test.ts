import { describe, it, expect } from 'vitest'
import { firstUnansweredStep } from '@/lib/answers/resume'

describe('firstUnansweredStep()', () => {
  const ids = ['G1', 'G2', 'G3', 'G4', 'G5']
  it('returns 0 when nothing is answered', () => {
    expect(firstUnansweredStep(ids, {})).toBe(0)
  })
  it('returns the first gap when partially answered', () => {
    expect(firstUnansweredStep(ids, { G1: 3, G2: 5 })).toBe(2)
  })
  it('skips leading answered items to the first gap', () => {
    expect(firstUnansweredStep(ids, { G1: 3, G3: 5 })).toBe(1)
  })
  it('returns 0 when every item is answered (review / Take-Again)', () => {
    expect(firstUnansweredStep(ids, { G1: 1, G2: 2, G3: 3, G4: 4, G5: 5 })).toBe(0)
  })
})
