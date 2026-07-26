// Source-reading tripwire: admins get a Member × Category matrix, fed by the admin-gated RPC and
// the pure pivot, rendered as an accessible, horizontally-scrollable table (colour never the sole
// signal; own row highlighted).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const DIR = ['app', 'app', '[churchId]']
const page = read(...DIR, 'page.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const matrix = read(...DIR, 'member-coverage-matrix.tsx')

describe('admin Member × Category matrix', () => {
  it('page wires the RPC, pivot, and component', () => {
    expect(page).toContain('get_member_category_coverage')
    expect(page).toContain('get_church_members')
    expect(page).toContain('buildMemberMatrix')
    expect(page).toContain('MemberCoverageMatrix')
  })
  it('renders a semantic, scrollable table', () => {
    expect(matrix).toContain('<table')
    expect(matrix).toContain('<caption')
    expect(matrix).toContain('scope="col"')
    expect(matrix).toContain('scope="row"')
    expect(matrix).toContain('overflow-x-auto')
  })
  it('keeps colour from being the sole signal and highlights the own row', () => {
    expect(matrix).toContain('bg-status-')
    expect(matrix).toContain('STATUS_LABEL')
    expect(matrix).toContain('aria-hidden="true"')
    expect(matrix).toContain('(you)')
  })
})
