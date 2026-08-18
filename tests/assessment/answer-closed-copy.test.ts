// Source-reading tripwire (node env, no DOM), companion to answer-readonly-when-complete.test.ts.
// ADR 0003 Q3: the read-only review names the close and its date when closed_at is known, and keeps
// today's sentence for an old-path run (complete, closed_at null). Both directions are pinned.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'), 'utf8'))

describe('answer page: closed copy vs fallback', () => {
  it('imports the closed copy from the shared source', () => {
    expect(page).toContain("import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'")
  })
  it('renders closedReadOnlyCopy(run.closed_at) when closed_at is set, else today\'s sentence — inside the read-only <p>', () => {
    const m = page.match(
      /<p className="font-body text-sm text-ink-soft">\s*\{run\?\.closed_at\s*\?\s*closedReadOnlyCopy\(run\.closed_at\)\s*:\s*'This assessment is complete, so your answers are read-only\.'\}\s*<\/p>/,
    )
    expect(m).not.toBeNull()
    // exactly one read-only sentence site — the fallback literal must not be duplicated elsewhere
    expect(page.match(/so your answers are read-only\./g)?.length).toBe(1)
  })
  it('the closed copy itself is the spec sentence with the date', () => {
    expect(closedReadOnlyCopy('2026-08-18T14:03:00.000Z')).toBe(
      'This assessment was closed by your church admin on August 18, 2026, so your answers are read-only.',
    )
  })
})
