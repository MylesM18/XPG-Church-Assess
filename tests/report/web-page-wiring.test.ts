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

    it('renders the PLAIN regenerateReport form exactly once — the stale block when prose is off; every AI-on path goes through AutoGenerateReport', () => {
      // Occurrence-count equality, not presence (feedback_nonvacuity_two_classes). Since
      // fix/auto-generate-hardening the client component owns the Generate / Regenerate button on
      // the AI-on paths (so it can be aria-disabled while the auto-run it just started is in
      // flight); the Server-Component form survives only for the prose-off stale notice, whose
      // behaviour is deliberately unchanged.
      expect(count(page, /<form action=\{regenerateReport\}>/g)).toBe(1)
      expect(count(page, /<input type="hidden" name="churchId" value=\{churchId\} \/>/g)).toBe(1)
    })

    it('gates the generate block on !stale && needsGeneration && aiOn, wrapped in ReportNotice, with its own copy and label', () => {
      const m = page.match(/\{!stale\s*&&\s*needsGeneration\s*&&\s*aiOn\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)
      expect(m).not.toBeNull()
      const block = m![1]!
      expect(block).toContain('<AutoGenerateReport')
      expect(block).not.toContain('<form')
      // Distinct copy: this is not a settings-change situation, so it must not reuse the D-P5-8
      // stale sentence, and the button says Generate, not Regenerate.
      expect(block).not.toContain('predates your latest settings change')
      expect(block).toContain('This report hasn’t been written by the model yet.')
      expect(block).toContain('label="Generate report"')
      expect(block).not.toContain('label="Regenerate report"')
    })

    it('keeps the stale copy exactly once, the generate copy exactly once, and each button label exactly once per path', () => {
      expect(count(page, /This report predates your latest settings change\./g)).toBe(1)
      expect(count(page, /This report hasn’t been written by the model yet\./g)).toBe(1)
      // The plain (prose-off) form's own button text, once; the two client-owned buttons carry
      // their text as the `label` prop, once each.
      expect(count(page, />\s*Regenerate report\s*</g)).toBe(1)
      expect(count(page, />\s*Generate report\s*</g)).toBe(0)
      expect(count(page, /label="Regenerate report"/g)).toBe(1)
      expect(count(page, /label="Generate report"/g)).toBe(1)
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
  // `regenerateReport` server action once per browser session per (church, INPUTS HASH).
  //
  // Greptile P1 (PR #79, "Stale latch blocks later generations"): the latch used to be keyed on
  // the TRIGGER ('stale' | 'generate'), so once an auto-run had fired for `stale`, a LATER settings
  // change in the same tab session — a new inputs hash, a genuinely new stale state — was
  // suppressed for the rest of the session. Keyed on the resolver's `inputsHash` instead: a new
  // hash is a new latch (auto-fires again), the same hash never re-fires (the button is the
  // retry), and the trigger prop is gone — a hash is stale-or-generate, the distinction is moot.
  //
  // fix/auto-generate-hardening (post-merge review of #79, findings 1/3/4): the component now
  // OWNS the Generate / Regenerate button — the Server-Component form beside it stayed live while
  // the auto-run it had just started was in flight, so a click doubled the model spend with no
  // dedup able to see in-flight work. `await action(fd)` is guarded: a transport-level rejection
  // of an auto-fired POST (dropped connection, 504 at the duration cap) used to reach the root
  // error boundary — the app has no error.tsx — and replace the whole page on a mere view. And
  // the mount effect is gated on `auto`, which the page sets to `!runIsOpen`: on an OPEN /
  // reopened run every member submission is a new inputs hash, so view-time auto-generation
  // regenerated the whole report per submission, bypassing the dashboard's "everyone has
  // finished" gate. router.refresh() is gone: the action revalidates the page itself on every
  // path that changes it, including a dedup skip.
  describe('auto-generate on admin view (AutoGenerateReport)', () => {
    const component = read('app', 'app', '[churchId]', 'diagnosis', 'auto-generate-report.tsx')
    const rawComponent = fs.readFileSync(
      path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'auto-generate-report.tsx'),
      'utf8',
    )

    it('is a client component that receives the server action, inputsHash, label and auto as props (no trigger) and never imports ../actions itself', () => {
      // The action is passed DOWN from the Server Component so page.tsx keeps its single import of
      // regenerateReport (pinned below); the client file must not grow its own import path to it.
      expect(rawComponent.trimStart().startsWith("'use client'")).toBe(true)
      expect(component).not.toContain("from '../actions'")
      expect(component).not.toContain("from './actions'")
      expect(component).toMatch(/action: \(formData: FormData\) => Promise<void>/)
      expect(component).toMatch(/inputsHash: string/)
      expect(component).toMatch(/label: 'Generate report' \| 'Regenerate report'/)
      expect(component).toMatch(/auto: boolean/)
      expect(component).not.toMatch(/trigger: 'generate' \| 'stale'/)
      expect(count(component, /\btrigger\b/g)).toBe(0)
    })

    it('auto-fires only when `auto`, inside a transition, latched on a sessionStorage key namespaced by (church, inputsHash) — and never refreshes the router itself', () => {
      expect(component).toContain("import { useEffect, useState, useTransition } from 'react'")
      expect(component).not.toContain("from 'next/navigation'")
      expect(count(component, /router\.refresh\(\)/g)).toBe(0)
      // The effect bails FIRST on !auto (an open / reopened run must not auto-spend), then reads
      // the latch, then SETS it before anything is awaited (survives strict-mode double effects
      // and any later refresh). Keyed on the INPUTS HASH, never the trigger.
      const effectStart = component.indexOf('useEffect(')
      const effectEnd = component.indexOf('}, [auto, churchId, inputsHash, action])')
      // Guard both anchors: indexOf(-1) would silently widen the slice to the whole file.
      expect(effectStart).toBeGreaterThan(-1)
      expect(effectEnd).toBeGreaterThan(effectStart)
      const effect = component.slice(effectStart, effectEnd)
      expect(effect.indexOf('if (!auto) return')).toBeGreaterThan(-1)
      expect(effect.indexOf('if (!auto) return')).toBeLessThan(effect.indexOf('sessionStorage.getItem('))
      expect(component).toContain('`xpg:autogen:${churchId}:${inputsHash}`')
      expect(count(component, /xpg:autogen:/g)).toBe(1)
      expect(count(component, /sessionStorage\.getItem\(/g)).toBe(1)
      expect(count(component, /sessionStorage\.setItem\(/g)).toBe(1)
      expect(effect.indexOf('sessionStorage.getItem(')).toBeLessThan(effect.indexOf('sessionStorage.setItem('))
      expect(effect.indexOf('sessionStorage.setItem(')).toBeLessThan(effect.indexOf('startTransition('))
      // Two transition sites — the mount effect and the click — sharing ONE invoke path.
      expect(count(component, /startTransition\(/g)).toBe(2)
    })

    it('guards the awaited action: transport failures are swallowed (the button is the retry), and the FormData names churchId + auto exactly as the action reads them', () => {
      expect(count(component, /await action\(fd\)/g)).toBe(1)
      const tryIdx = component.indexOf('try {')
      const awaitIdx = component.indexOf('await action(fd)')
      const catchIdx = component.indexOf('} catch')
      for (const idx of [tryIdx, awaitIdx, catchIdx]) expect(idx).toBeGreaterThan(-1)
      expect(tryIdx).toBeLessThan(awaitIdx)
      expect(awaitIdx).toBeLessThan(catchIdx)
      expect(component).toContain("fd.set('churchId', churchId)")
      // `auto=1` is what the server's back-off rule keys on (actions.ts); a manual click must NOT
      // send it — the button is the retry that bypasses the back-off.
      expect(count(component, /fd\.set\('auto', '1'\)/g)).toBe(1)
      expect(component).toMatch(/if \(auto\) fd\.set\('auto', '1'\)/)
    })

    it('owns the button: type="button", aria-disabled while pending with an `if (pending) return` guard, label swaps while writing, no <form>', () => {
      // a11y pending-controls contract (tests/a11y/pending-controls.test.ts): aria-disabled, never
      // native disabled; the guard is what stops a second activation. The label swap follows the
      // house precedent (regenerate-diagnosis-button.tsx's `{pending ? 'Regenerating…' : …}`).
      expect(count(component, /<button/g)).toBe(1)
      expect(component).toContain('type="button"')
      expect(component).toContain('aria-disabled={pending}')
      expect(component).toMatch(/if \(pending\) return/)
      expect(component).toMatch(/\{pending \? 'Writing…' : label\}/)
      expect(component).not.toContain('<form')
      expect(component).not.toMatch(/(?<!aria-)disabled=\{/)
    })

    // feat/report-wait-experience: generation runs ~45-60 s (worst ~3.5 min), long enough that a
    // disabled button on its own reads as a hung page. The button grows a spinner and a rotating
    // line of reassurance appears beneath it, revealed word by word.
    //
    // The whole visual layer is DECORATIVE and must be aria-hidden. A screen reader already hears
    // the one stable "Writing your report with the model…" from <LiveStatus>; piping a rotating,
    // per-word-changing string into a live region would re-announce on every tick — chattier than
    // silence and worse than the problem it solves. That separation is the point of these pins.
    it('shows a spinner while pending, marked decorative, that stops under reduced motion via the global CSS rule', () => {
      // app/globals.css kills `animation-*` under prefers-reduced-motion for every element, so a
      // CSS-animated spinner needs no JS branch of its own.
      expect(count(component, /animate-spin/g)).toBe(1)
      expect(component).toMatch(/const SPINNER =[\s\S]{0,200}animate-spin/)
      // Inside the button — "next to it" — not floating elsewhere in the notice, mounted only
      // while pending, and decorative.
      const button = component.slice(component.indexOf('<button'), component.indexOf('</button>'))
      expect(button).toContain('className={SPINNER}')
      expect(button).toContain('aria-hidden="true"')
      expect(button).toMatch(/\{pending && <span/)
    })

    it('reveals the wait phrases word by word through the pure state machine, never re-implementing the arithmetic inline', () => {
      expect(component).toMatch(/from '@\/lib\/report\/wait-phrases'/)
      for (const fn of ['initialWaitState', 'stepWaitState', 'waitDelayMs', 'revealWords']) {
        expect(component, `${fn} must come from the tested module`).toContain(fn)
      }
      // The tick is a self-rescheduling timeout that is always cleaned up — a leaked timer would
      // keep ticking after the report arrives and the notice unmounts.
      expect(count(component, /setTimeout\(/g)).toBe(1)
      expect(count(component, /clearTimeout\(/g)).toBe(1)
      // Reduced motion is a JS decision here (the CSS rule cannot stop a setTimeout chain).
      expect(component).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
      // The reveal restarts with each run rather than resuming mid-sentence from the last one.
      expect(component).toContain('initialWaitState(phrases, reduced)')
    })

    it('keeps the rotating line OUT of the live region: it is aria-hidden, and LiveStatus keeps its one stable message', () => {
      // The single most important a11y property of this feature.
      expect(component).toContain("message={pending ? 'Writing your report with the model…' : null}")
      expect(count(component, /Writing your report with the model…/g)).toBe(1)
      // The element that actually carries the rotating text must be decorative...
      const revealIdx = component.indexOf('revealWords(')
      const pOpenTag = component.slice(component.lastIndexOf('<p', revealIdx), component.indexOf('>', component.lastIndexOf('<p', revealIdx)))
      expect(pOpenTag).toContain('aria-hidden="true"')
      // ...and the live region must never be handed it.
      const liveStatusIdx = component.indexOf('<LiveStatus')
      const liveStatusJsx = component.slice(liveStatusIdx, component.indexOf('/>', liveStatusIdx))
      expect(liveStatusJsx).not.toContain('revealWords')
      expect(liveStatusJsx).not.toContain('phrases')
      // No second live region, and the phrase never becomes LiveStatus's message.
      expect(count(component, /<LiveStatus\b/g)).toBe(1)
      expect(component).not.toMatch(/message=\{[^}]*revealWords/)
      expect(component).not.toContain('role="status"')
      expect(component).not.toContain('aria-live')
    })

    it('takes the phrases as a prop — the client never reads the table itself', () => {
      expect(component).toMatch(/phrases: readonly string\[\]/)
      expect(component).not.toContain('report_wait_phrases')
      expect(component).not.toContain('supabase')
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

    it('page.tsx threads the resolver\'s inputsHash through a `let`, like `stale` / `cover`', () => {
      // resolveReportSections already returns `inputsHash` (lib/report/resolve.ts); the page reads
      // it off `resolved` in the scoreable block, alongside the other resolver outputs.
      expect(page).toContain('let inputsHash: string | null = null')
      expect(page).toContain('inputsHash = resolved.inputsHash')
    })

    it('page.tsx imports it once and renders it exactly twice — each with inputsHash={inputsHash!}, action={regenerateReport}, auto={!runIsOpen}, phrases, and a distinct label', () => {
      // JSX prop lists wrap across lines; collapse whitespace so a reformat cannot false-fail.
      const flat = page.replace(/\s+/g, ' ')
      expect(count(page, /import \{ AutoGenerateReport \} from '\.\/auto-generate-report'/g)).toBe(1)
      expect(count(page, /import \{ regenerateReport \} from '\.\.\/actions'/g)).toBe(1)
      expect(count(page, /<AutoGenerateReport\b/g)).toBe(2)
      // Occurrence-count equality: both mounts carry the hash, the action, the run-status gate and
      // the phrases; the labels differ; the trigger prop is gone everywhere.
      expect(count(flat, /<AutoGenerateReport churchId=\{churchId\} inputsHash=\{inputsHash!\} action=\{regenerateReport\} label="Regenerate report" auto=\{!runIsOpen\} phrases=\{waitPhrases\} \/>/g)).toBe(1)
      expect(count(flat, /<AutoGenerateReport churchId=\{churchId\} inputsHash=\{inputsHash!\} action=\{regenerateReport\} label="Generate report" auto=\{!runIsOpen\} phrases=\{waitPhrases\} \/>/g)).toBe(1)
      expect(count(page, /auto=\{!runIsOpen\}/g)).toBe(2)
      expect(count(page, /phrases=\{waitPhrases\}/g)).toBe(2)
      expect(count(page, /trigger=/g)).toBe(0)
      // `runIsOpen` is the page's existing run-status derivation (ADR 0003), computed once.
      expect(count(page, /const runIsOpen = run!\.status === 'in_progress'/g)).toBe(1)
    })

    it('page.tsx loads the phrases through the data seam, and ONLY when a notice will actually render', () => {
      // ADR 0002: the table string lives in lib/data/* (pinned exhaustively in
      // tests/report/wait-phrases-seed.test.ts). The read is one small select, but it is pure
      // waste on the common path where the report is already fine and no notice renders — so it
      // is gated on the same condition the notices are.
      expect(page).toContain("import { loadWaitPhrases } from '@/lib/data/wait-phrases'")
      expect(page).not.toContain('report_wait_phrases')
      expect(count(page, /loadWaitPhrases\(/g)).toBe(1)
      expect(page).toMatch(/const waitPhrases = aiOn && \(stale \|\| needsGeneration\)\s*\? await loadWaitPhrases\(supabase\)\s*: \[\]/)
    })

    it('the stale notice renders AutoGenerateReport when prose is on and the plain form otherwise; the generate notice renders only AutoGenerateReport', () => {
      const staleBlock = page.match(/\{stale\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)![1]!
      expect(staleBlock).toContain('This report predates your latest settings change.')
      // Ternary on aiOn: the client-owned button (which can go aria-disabled while its own
      // auto-run is in flight) when the model can run; the pre-existing plain form when it cannot
      // (regenerate would silently no-op — deliberately unchanged, see finding 15).
      expect(staleBlock.replace(/\s+/g, ' ')).toContain(
        '{aiOn ? ( <AutoGenerateReport churchId={churchId} inputsHash={inputsHash!} action={regenerateReport} label="Regenerate report" auto={!runIsOpen} phrases={waitPhrases} /> ) : ( <form action={regenerateReport}>',
      )
      expect(count(staleBlock, /<form action=\{regenerateReport\}>/g)).toBe(1)

      const genBlock = page.match(/\{!stale\s*&&\s*needsGeneration\s*&&\s*aiOn\s*&&\s*\(\s*<ReportNotice>([\s\S]*?)<\/ReportNotice>/)![1]!
      expect(genBlock.replace(/\s+/g, ' ')).toContain(
        '<AutoGenerateReport churchId={churchId} inputsHash={inputsHash!} action={regenerateReport} label="Generate report" auto={!runIsOpen} phrases={waitPhrases} />',
      )
      expect(genBlock).not.toContain('<form')
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
