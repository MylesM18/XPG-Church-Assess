// Source-reading tripwire: each category card shows the current user's own "X out of N Questions"
// (N = cat.items.length, never hardcoded 5), sourced from answeredCount.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('per-card personal progress counter', () => {
  it('renders an "out of N Questions" counter', () => {
    expect(CODE).toContain('out of')
    expect(CODE).toContain('Questions')
  })
  it('uses the dynamic item count, not a hardcoded 5', () => {
    expect(CODE).toContain('cat.items.length')
  })
  it('sources the count from the current user’s own coverage', () => {
    expect(CODE).toContain('answeredCount')
    expect(CODE).toContain('ownAnsweredById')
  })
})
