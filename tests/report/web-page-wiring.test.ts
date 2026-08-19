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
  // distinct notice when the resolver reports `needsGeneration` and prose is enabled. Since
  // fix/prose-auto-generate-on-view the gate is the shared `proseEnabled()` helper
  // (lib/ai/prose-mode.ts) — the very function the action reads — so the button never renders
  // when the action would silently return, and no page-side inline env read can drift from it.
  describe('generate affordance when no AI section is usable (H7-A / H7-B)', () => {
    it('reads needsGeneration off the resolver into a `let`, like `stale`', () => {
      expect(page).toContain('let needsGeneration = false')
      expect(page).toContain('needsGeneration = resolved.needsGeneration')
    })

    it("keys the button on the action's own gate: proseEnabled() from lib/ai/prose-mode, called once, no inline PROSE_MODE read", () => {
      expect(page).toContain("import { proseEnabled } from '@/lib/ai/prose-mode'")
      expect(count(page, /proseEnabled\(\)/g)).toBe(1)
      expect(page).toContain('const aiOn = proseEnabled()')
      expect(count(page, /process\.env\.PROSE_MODE/g)).toBe(0)
    })

    it('renders the regenerateReport form exactly twice — the stale block AND the generate block, each with the hidden churchId', () => {
      // Occurrence-count equality, not presence (feedback_nonvacuity_two_classes): the stale
      // block already carried one form, so a bare `toContain` here proves nothing.
      expect(count(page, /<form action=\{regenerateReport\}>/g)).toBe(2)
      expect(count(page, /<input type="hidden" name="churchId" value=\{churchId\} \/>/g)).toBe(2)
    })

    it('gates the generate block on !stale && needsGeneration && aiOn, wrapped in ReportNotice, with its own copy', () => {
      const m = page.match(/\{!stale\s*&&\s*needsGeneration\s*&&\s*aiOn\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)
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
      const gen = page.indexOf('{!stale && needsGeneration && aiOn &&')
      const cover = page.indexOf('<ReportCover')
      expect(gen).toBeGreaterThan(stale)
      expect(gen).toBeLessThan(cover)
    })
  })

  // fix/prose-auto-generate-on-view (2026-08-19): the owner wants the model to run WHEN AN ADMIN
  // VIEWS the diagnosis, not only when they find and click the Generate / Regenerate button. The
  // page therefore mounts a small client component in BOTH notice blocks that fires the same
  // `regenerateReport` server action once per browser session per (church, trigger) and then
  // router.refresh()es. The forms stay exactly as they were: they are the retry path.
  describe('auto-generate on admin view (AutoGenerateReport)', () => {
    const component = read('app', 'app', '[churchId]', 'diagnosis', 'auto-generate-report.tsx')
    const rawComponent = fs.readFileSync(
      path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'auto-generate-report.tsx'),
      'utf8',
    )

    it('is a client component that receives the server action as a prop and never imports ../actions itself', () => {
      // The action is passed DOWN from the Server Component so page.tsx keeps its single import of
      // regenerateReport (pinned below); the client file must not grow its own import path to it.
      expect(rawComponent.trimStart().startsWith("'use client'")).toBe(true)
      expect(component).not.toContain("from '../actions'")
      expect(component).not.toContain("from './actions'")
      expect(component).toMatch(/action: \(formData: FormData\) => Promise<void>/)
      expect(component).toMatch(/trigger: 'generate' \| 'stale'/)
    })

    it('fires inside a transition, refreshes the router afterwards, and latches on a namespaced sessionStorage key', () => {
      expect(component).toContain("import { useEffect, useTransition } from 'react'")
      expect(component).toContain("import { useRouter } from 'next/navigation'")
      expect(count(component, /startTransition\(/g)).toBe(1)
      expect(count(component, /router\.refresh\(\)/g)).toBe(1)
      // The latch is SET before the action is awaited (survives strict-mode double effects and
      // any later refresh), and read first so a second mount with the key present does nothing.
      expect(component).toContain('`xpg:autogen:${churchId}:${trigger}`')
      expect(count(component, /sessionStorage\.getItem\(/g)).toBe(1)
      expect(count(component, /sessionStorage\.setItem\(/g)).toBe(1)
      expect(component.indexOf('sessionStorage.getItem(')).toBeLessThan(component.indexOf('sessionStorage.setItem('))
      expect(component.indexOf('sessionStorage.setItem(')).toBeLessThan(component.indexOf('startTransition('))
      expect(component.indexOf('await action(fd)')).toBeLessThan(component.indexOf('router.refresh()'))
      // The FormData carries churchId under the exact name the action reads.
      expect(component).toContain("fd.set('churchId', churchId)")
    })

    it('announces the pending state through LiveStatus (always mounted, tone="status" ⇒ aria-live polite), with the agreed copy', () => {
      // tests/a11y/live-regions-applied.test.ts forbids a conditionally mounted role="status" /
      // aria-live element and requires every status message to route through <LiveStatus>, whose
      // role="status" implies aria-live="polite". So the copy is bound to LiveStatus's message
      // prop, and the region itself is never behind `pending &&`.
      expect(component).toContain("import { LiveStatus } from '@/components/live-status'")
      expect(count(component, /<LiveStatus\b/g)).toBe(1)
      expect(component).toMatch(/<LiveStatus[\s\S]*?tone="status"/)
      expect(component).toContain("message={pending ? 'Writing your report with the model…' : null}")
      expect(count(component, /Writing your report with the model…/g)).toBe(1)
      expect(component).not.toMatch(/&&\s*\(?\s*<LiveStatus/)
      expect(component).not.toContain('role="status"')
      expect(component).not.toContain('aria-live')
    })

    it('page.tsx imports it once and renders it exactly twice — trigger="stale" and trigger="generate" — each with action={regenerateReport}', () => {
      expect(count(page, /import \{ AutoGenerateReport \} from '\.\/auto-generate-report'/g)).toBe(1)
      expect(count(page, /import \{ regenerateReport \} from '\.\.\/actions'/g)).toBe(1)
      expect(count(page, /<AutoGenerateReport\b/g)).toBe(2)
      expect(count(page, /<AutoGenerateReport churchId=\{churchId\} trigger="stale" action=\{regenerateReport\} \/>/g)).toBe(1)
      expect(count(page, /<AutoGenerateReport churchId=\{churchId\} trigger="generate" action=\{regenerateReport\} \/>/g)).toBe(1)
    })

    it('places the stale trigger inside the stale notice (gated on aiOn, above its form) and the generate trigger inside the generate notice', () => {
      const staleBlock = page.match(/\{stale\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)![1]!
      // The stale notice + form still render when prose is off (regenerate would silently no-op),
      // exactly as before — only the auto-trigger is additionally gated on aiOn.
      expect(staleBlock).toContain('This report predates your latest settings change.')
      expect(staleBlock).toMatch(/\{aiOn && <AutoGenerateReport churchId=\{churchId\} trigger="stale" action=\{regenerateReport\} \/>\}/)
      expect(staleBlock.indexOf('<AutoGenerateReport')).toBeLessThan(staleBlock.indexOf('<form action={regenerateReport}>'))

      const genBlock = page.match(/\{!stale\s*&&\s*needsGeneration\s*&&\s*aiOn\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)![1]!
      expect(genBlock).toContain('<AutoGenerateReport churchId={churchId} trigger="generate" action={regenerateReport} />')
      expect(genBlock.indexOf('<AutoGenerateReport')).toBeLessThan(genBlock.indexOf('<form action={regenerateReport}>'))
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
