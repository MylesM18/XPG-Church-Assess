// Source-reading tripwire (node env, no DOM): the admin "Member progress" matrix must present its
// table inside a bordered card, matching the Invite Member form card so the two sections read as a
// set. Anchored on the table's scroll wrapper (the element carrying `overflow-x-auto`); comments are
// stripped so a commented-out class can't satisfy the check.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const matrix = read('app', 'app', '[churchId]', 'member-coverage-matrix.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('member progress matrix card', () => {
  it('wraps the table scroll container in a bordered card', () => {
    const wrapper = matrix.match(/className="([^"]*overflow-x-auto[^"]*)"/)
    expect(wrapper, 'the table must keep its overflow-x-auto scroll wrapper').not.toBeNull()
    const classes = wrapper![1]
    expect(classes, 'the matrix card must carry a border, like the Invite Member card').toContain(
      'border border-line',
    )
    expect(classes, 'the matrix card must use the rounded-lg card radius').toContain('rounded-lg')
  })
})
