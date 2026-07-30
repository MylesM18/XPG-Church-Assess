// Source-reading tripwire (node env, no DOM). The read-only review shows one section at a time; it
// must offer prev/next navigation across the methodology sections (and an "Area N of M" indicator),
// so a reviewer isn't stranded on the first section. Removing the stepper turns this red.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('review section navigation', () => {
  it('derives prev/next from the ordered methodology sections', () => {
    expect(page, 'imports the pure nav helper').toContain("from '@/lib/review/section-nav'")
    expect(page, 'walks the methodology section order').toContain(
      'sectionNav(methodology.questions.categories, categoryId)',
    )
  })

  it('renders prev and next links to the sibling sections', () => {
    expect(page).toContain('nav.prev.id')
    expect(page).toContain('nav.next.id')
    expect(page).toContain('nav.prev.name')
    expect(page).toContain('nav.next.name')
    // both point at the same review route, one section over
    expect(page).toMatch(/answer\/\$\{nav\.(prev|next)\.id\}/)
  })

  it('shows the reviewer where they are in the sequence', () => {
    expect(page).toContain('nav.index + 1')
    expect(page).toContain('nav.total')
  })

  it('lives on the read-only branch, after the writability gate', () => {
    // The stepper belongs to the review (completed run), not the editable form.
    expect(page.indexOf('canAcceptAnswers')).toBeGreaterThanOrEqual(0)
    expect(page.indexOf('nav.next.id')).toBeGreaterThan(page.indexOf('canAcceptAnswers'))
  })
})
