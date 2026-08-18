// Source-reading tripwire (node env, no DOM) — the diagnosis page is a server component with a live
// DB dependency; source reading is the repo's standing substitute (see tests/report/web-page-wiring).
// ADR 0003 Q4: an admin may Generate while the run is open; the page must say so, with N of M, above
// the report — and say nothing when the run is closed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'page.tsx'), 'utf8'))
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('diagnosis page: still-open note (ADR 0003)', () => {
  it('reads run.status (selected since :81 but never read before) into runIsOpen', () => {
    expect(page).toContain(".select('id, status, methodology_version, completed_at')")
    expect(page).toContain("const runIsOpen = run!.status === 'in_progress'")
  })
  it('builds N of M from the same roster + matrix seam the dashboard uses, ONLY when open', () => {
    expect(page).toContain("import { churchMembers } from '@/lib/data/members'")
    expect(page).toContain("import { finishedMemberCount } from '@/lib/coverage/finished-members'")
    expect(page).toContain("import { openNoteText } from '@/lib/runs/close-reopen'")
    expect(page).toContain('let openNote: string | null = null')
    const gate = page.indexOf('if (runIsOpen) {')
    expect(gate).toBeGreaterThan(-1)
    const block = page.slice(gate, page.indexOf('openNote = openNoteText(finished, total)') + 1)
    expect(block).toContain('churchMembers<MatrixMember>(supabase, churchId)')
    expect(block).toContain("supabase.rpc('get_member_category_coverage', { p_church_id: churchId })")
    expect(block).toContain('buildMemberMatrix(')
    expect(block).toContain('finishedMemberCount(matrix)')
    // never the raw roster RPC (pages-use-seam)
    expect(page).not.toContain("rpc('get_church_members'")
  })
  it('renders the note in a ReportNotice between the toolbar and the stale notice, and nowhere else', () => {
    const m = page.match(/\{openNote && \(\s*<ReportNotice>\s*<p>\{openNote\}<\/p>\s*<\/ReportNotice>\s*\)\}/)
    expect(m).not.toBeNull()
    const noteAt = page.indexOf('{openNote && (')
    expect(page.indexOf('</ReportToolbar>')).toBeLessThan(noteAt)
    expect(noteAt).toBeLessThan(page.indexOf('{stale &&'))
    expect(count(page, /\{openNote && \(/g)).toBe(1)
  })
})
