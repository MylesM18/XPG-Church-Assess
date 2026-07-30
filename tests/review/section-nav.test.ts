import { describe, it, expect } from 'vitest'
import { sectionNav } from '@/lib/review/section-nav'

const cats = [
  { id: 'guest', name: 'Guest Experience' },
  { id: 'conn', name: 'Connection' },
  { id: 'disc', name: 'Discipleship' },
]

describe('sectionNav()', () => {
  it('gives both neighbours for a middle section', () => {
    expect(sectionNav(cats, 'conn')).toEqual({
      index: 1,
      total: 3,
      prev: { id: 'guest', name: 'Guest Experience' },
      next: { id: 'disc', name: 'Discipleship' },
    })
  })
  it('has no prev on the first section', () => {
    const nav = sectionNav(cats, 'guest')
    expect(nav.prev).toBeNull()
    expect(nav.next).toEqual({ id: 'conn', name: 'Connection' })
    expect(nav.index).toBe(0)
  })
  it('has no next on the last section', () => {
    const nav = sectionNav(cats, 'disc')
    expect(nav.next).toBeNull()
    expect(nav.prev).toEqual({ id: 'conn', name: 'Connection' })
    expect(nav.index).toBe(2)
  })
  it('returns index -1 and no neighbours for an unknown section', () => {
    expect(sectionNav(cats, 'nope')).toEqual({ index: -1, total: 3, prev: null, next: null })
  })
  it('has no neighbours when there is only one section', () => {
    expect(sectionNav([{ id: 'x', name: 'X' }], 'x')).toEqual({
      index: 0,
      total: 1,
      prev: null,
      next: null,
    })
  })
})
