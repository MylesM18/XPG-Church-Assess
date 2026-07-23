import { describe, it, expect } from 'vitest'
import { band, BANDS } from '@/lib/answers/band'

describe('band', () => {
  it('maps 1–3 to lo', () => {
    expect(band(1)).toBe('lo')
    expect(band(3)).toBe('lo')
  })
  it('maps 4–7 to mid', () => {
    expect(band(4)).toBe('mid')
    expect(band(7)).toBe('mid')
  })
  it('maps 8–10 to hi', () => {
    expect(band(8)).toBe('hi')
    expect(band(10)).toBe('hi')
  })
})

describe('BANDS', () => {
  it('labels the three bands in order', () => {
    expect(BANDS.map((b) => [b.key, b.label])).toEqual([
      ['lo', 'Low'],
      ['mid', 'Developing'],
      ['hi', 'Strong'],
    ])
  })
})
