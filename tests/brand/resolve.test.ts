import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveBrand,
  resolveMonogram,
  resolveTileColor,
  TILE_PALETTE,
} from '../../lib/brand/resolve'

describe('resolveMonogram', () => {
  it('skips stopwords and takes the first significant word (default 1 letter)', () => {
    expect(resolveMonogram('The Church of Grace')).toBe('C')
  })

  it('takes two significant initials when letters = 2', () => {
    expect(resolveMonogram('The Church of Grace', 2)).toBe('CG')
  })

  it('single significant word yields one letter even at letters = 2', () => {
    expect(resolveMonogram('Redeemer', 2)).toBe('R')
  })

  it('always uppercases', () => {
    expect(resolveMonogram('grace fellowship', 2)).toBe('GF')
  })

  it('falls back to raw words when every word is a stopword', () => {
    expect(resolveMonogram('the of')).toBe('T')
  })
})

describe('resolveTileColor', () => {
  it('is deterministic for the same name', () => {
    expect(resolveTileColor('Grace Community')).toBe(resolveTileColor('Grace Community'))
  })

  it('always returns a palette color and never berry', () => {
    for (const name of ['Grace', 'Hillside', 'New Life', 'The Bridge', 'Redeemer City']) {
      const color = resolveTileColor(name)
      expect(TILE_PALETTE).toContain(color)
      expect(color.toUpperCase()).not.toBe('#8E2B3E')
    }
  })

  it('palette has 8 tones and excludes berry', () => {
    expect(TILE_PALETTE).toHaveLength(8)
    expect(TILE_PALETTE.map((c) => c.toUpperCase())).not.toContain('#8E2B3E')
  })
})

describe('resolveBrand', () => {
  it('accepts a string or an object and trims displayName', () => {
    const a = resolveBrand('  Grace Church  ')
    expect(a.displayName).toBe('Grace Church')
    expect(a.monogram).toBe('G')
    expect(TILE_PALETTE).toContain(a.tileColor)

    const b = resolveBrand({ name: 'Grace Church' })
    expect(b).toEqual({ ...a, displayName: 'Grace Church' })
  })
})

describe('MONOGRAM_LETTERS env default', () => {
  afterEach(() => {
    delete process.env.MONOGRAM_LETTERS
  })

  it('defaults to 1 letter', () => {
    delete process.env.MONOGRAM_LETTERS
    expect(resolveMonogram('Grace Fellowship')).toBe('G')
  })

  it('honors MONOGRAM_LETTERS=2', () => {
    process.env.MONOGRAM_LETTERS = '2'
    expect(resolveMonogram('Grace Fellowship')).toBe('GF')
  })
})
