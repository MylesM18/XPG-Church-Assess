import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (...p: string[]) => stripComments(fs.readFileSync(path.join(ROOT, ...p), 'utf8'))
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('diagnosis page: toolbar, notices, cover, sections (Part B wiring)', () => {
  const page = read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx')

  it('imports the three web report chrome components and the CoverModel type', () => {
    expect(page).toContain("import { ReportCover } from './report/report-cover'")
    expect(page).toContain("import { ReportToolbar, ReportNotice } from './report/toolbar'")
    expect(page).toContain("import type { CoverModel } from '@/lib/report/charts'")
  })

  it('threads resolved.cover through a `let cover: CoverModel | null` and passes cover.band to ReportSections', () => {
    expect(page).toContain('let cover: CoverModel | null = null')
    expect(page).toContain('cover = resolved.cover')
    expect(page).toContain('band={cover.band}')
    expect(page).toContain('<ReportCover')
    expect(page).toContain('cover={cover}')
  })

  it('orders toolbar, stale notice, cover, sections — and nothing after the sections', () => {
    const toolbar = page.indexOf('<ReportToolbar')
    const stale = page.indexOf('{stale &&')
    const cover = page.indexOf('<ReportCover')
    const sections = page.indexOf('<ReportSections')
    expect(toolbar).toBeGreaterThan(-1)
    expect(toolbar).toBeLessThan(stale)
    expect(stale).toBeLessThan(cover)
    expect(cover).toBeLessThan(sections)
    expect(count(page, /Download PDF/g)).toBe(1)
    expect(page.indexOf('Download PDF')).toBeLessThan(sections)
    expect(page.indexOf('<ShareControl')).toBeLessThan(sections)
    expect(page.indexOf('<ShareControl')).toBeGreaterThan(toolbar)
    // Nothing but the closing tags follows the sections block.
    expect(page.slice(sections)).not.toContain('<a')
    expect(page.slice(sections)).not.toContain('<ShareControl')
  })

  it('wraps the stale copy + regenerate form and the not-scoreable notice in ReportNotice; toolbar-less when not scoreable', () => {
    expect(page).toMatch(/\{stale\s*&&\s*\(\s*<ReportNotice>/)
    expect(page).toMatch(/<ReportNotice>\s*<StaleMethodologyNotice churchId=\{churchId\}>\{notScoreableMessage\}<\/StaleMethodologyNotice>\s*<\/ReportNotice>/)
    expect(count(page, /<ReportToolbar/g)).toBe(1)
    expect(page.indexOf('<ReportToolbar')).toBeGreaterThan(page.indexOf('</StaleMethodologyNotice>'))
  })

  // H7 (2026-08-18): a completed run whose report has never been written by the model — no
  // `reports` row (H7-A) or a 100 %-fallback row at the live hash (H7-B) — is NOT stale, so the
  // only regenerate affordance never rendered and the model could never be invoked, whatever the
  // env was later set to. The page now offers the SAME `regenerateReport` form under a second,
  // distinct notice when the resolver reports `needsGeneration` and prose is enabled (mirroring
  // the action's own PROSE_MODE gate form exactly, so the button never renders when the action
  // would silently return).
  describe('generate affordance when no AI section is usable (H7-A / H7-B)', () => {
    it('reads needsGeneration off the resolver into a `let`, like `stale`', () => {
      expect(page).toContain('let needsGeneration = false')
      expect(page).toContain('needsGeneration = resolved.needsGeneration')
    })

    it("mirrors regenerateReport's PROSE_MODE gate form exactly, once", () => {
      // The action returns early when `(process.env.PROSE_MODE ?? 'fallback') === 'fallback'`;
      // the page must key the button on the same expression so the two can never disagree.
      expect(count(page, /\(process\.env\.PROSE_MODE \?\? 'fallback'\) !== 'fallback'/g)).toBe(1)
      expect(page).toContain("const proseEnabled = (process.env.PROSE_MODE ?? 'fallback') !== 'fallback'")
    })

    it('renders the regenerateReport form exactly twice — the stale block AND the generate block, each with the hidden churchId', () => {
      // Occurrence-count equality, not presence (feedback_nonvacuity_two_classes): the stale
      // block already carried one form, so a bare `toContain` here proves nothing.
      expect(count(page, /<form action=\{regenerateReport\}>/g)).toBe(2)
      expect(count(page, /<input type="hidden" name="churchId" value=\{churchId\} \/>/g)).toBe(2)
    })

    it('gates the generate block on !stale && needsGeneration && proseEnabled, wrapped in ReportNotice, with its own copy', () => {
      const m = page.match(/\{!stale\s*&&\s*needsGeneration\s*&&\s*proseEnabled\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)
      expect(m).not.toBeNull()
      const block = m![1]!
      expect(block).toContain('<form action={regenerateReport}>')
      expect(block).toContain('<input type="hidden" name="churchId" value={churchId} />')
      // Distinct copy: this is not a settings-change situation, so it must not reuse the D-P5-8
      // stale sentence, and the button says Generate, not Regenerate.
      expect(block).not.toContain('predates your latest settings change')
      expect(block).toContain('This report hasn’t been written by the model yet.')
      expect(block).toMatch(/>\s*Generate report\s*</)
      expect(block).not.toMatch(/>\s*Regenerate report\s*</)
    })

    it('keeps the stale copy exactly once and the generate copy exactly once', () => {
      expect(count(page, /This report predates your latest settings change\./g)).toBe(1)
      expect(count(page, /This report hasn’t been written by the model yet\./g)).toBe(1)
      expect(count(page, />\s*Regenerate report\s*</g)).toBe(1)
      expect(count(page, />\s*Generate report\s*</g)).toBe(1)
    })

    it('places the generate block after the stale block and before the cover', () => {
      const stale = page.indexOf('{stale &&')
      const gen = page.indexOf('{!stale && needsGeneration && proseEnabled &&')
      const cover = page.indexOf('<ReportCover')
      expect(gen).toBeGreaterThan(stale)
      expect(gen).toBeLessThan(cover)
    })
  })

  it('moved the monogram + church name into the cover (no separate identity row) and formats the date like the PDF', () => {
    expect(count(page, /brand\.monogram/g)).toBe(1)
    expect(page).toContain('monogram={brand.monogram}')
    expect(page).toContain('churchName={church.name}')
    expect(page).toContain('brandColor={church.brand_color}')
    expect(page).toContain("toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })")
    expect(page).toContain('dateLabel={dateLabel}')
    expect(page).toContain('className="flex flex-col gap-10"')
  })
})

describe('public share page: cover derived like the resolver, band threaded, no duplicate CTA', () => {
  const page = read('app', 'r', '[shareToken]', 'page.tsx')

  it('derives the cover with coverModel(facts, reportMethodology) — no new data access', () => {
    expect(page).toContain("import { coverModel } from '@/lib/report/charts'")
    expect(count(page, /coverModel\(/g)).toBe(1)
    expect(page).toContain('const cover = coverModel(facts, reportMethodology)')
  })

  it('renders ReportCover (no date) before ReportSections with band={cover.band}', () => {
    expect(page).toContain("import { ReportCover } from '@/app/app/[churchId]/diagnosis/report/report-cover'")
    expect(page).toContain('<ReportCover')
    expect(page).toContain('dateLabel={null}')
    expect(page).toContain('churchName={row.church_name}')
    expect(page).toContain('brandColor={row.brand_color}')
    expect(page).toContain('band={cover.band}')
    expect(page.indexOf('<ReportCover')).toBeLessThan(page.indexOf('<ReportSections'))
    expect(page).toContain('className="flex flex-col gap-10"')
  })

  it('no longer renders its own page-chrome BookingCta (ReportSections carries the s12 CTA)', () => {
    expect(page).not.toContain('<BookingCta')
    expect(page).not.toMatch(/import \{[^}]*\bBookingCta\b[^}]*\}/)
    expect(page).toContain('SharedStaleMethodologyNotice')
  })

  it('keeps the shared read-only footer after the sections', () => {
    // lastIndexOf: the not-scoreable branch (earlier in the file) carries the same footer copy.
    expect(page.lastIndexOf('Shared read-only view.')).toBeGreaterThan(page.indexOf('<ReportSections'))
  })
})
