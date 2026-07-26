// Source-reading tripwire (node env, no DOM): the admin "Member progress" matrix must (a) present
// its table inside a bordered card matching the Invite Member form, and (b) cap the visible height so
// a long roster scrolls instead of stretching the page, with the header kept in view. Comments are
// stripped so a commented-out class can't satisfy a check.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const matrix = read('app', 'app', '[churchId]', 'member-coverage-matrix.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

const classAttrs = [...matrix.matchAll(/className="([^"]+)"/g)].map((m) => m[1] ?? '')

describe('member progress matrix card', () => {
  it('wraps the table in a bordered card, like the Invite Member card', () => {
    const card = classAttrs.find((c) => c.includes('rounded-lg')) ?? ''
    expect(card, 'the matrix must have a rounded-lg card wrapper').toContain('rounded-lg')
    expect(card, 'the matrix card must carry a border, like the Invite Member card').toContain(
      'border border-line',
    )
  })

  it('caps the box height and scrolls the overflow', () => {
    const scroller = classAttrs.find((c) => /\bmax-h-/.test(c)) ?? ''
    expect(scroller, 'the matrix must cap its height with a max-h- utility').toMatch(/\bmax-h-/)
    expect(scroller, 'the capped box must scroll its overflow').toMatch(/\boverflow-(auto|y-auto)\b/)
  })

  it('keeps the header row visible while members scroll', () => {
    expect(matrix, 'the header cells must be sticky so they stay put while rows scroll').toContain(
      'sticky top-0',
    )
  })
})
