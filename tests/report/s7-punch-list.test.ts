// `.ts` not `.tsx` — vitest.config.ts's include is `tests/**/*.test.ts`, so a `.tsx` file would
// never be collected (silently, exit code 0). JSX is written as createElement, exactly as
// tests/report/sections-dispatch.test.ts does.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PDFParse } from 'pdf-parse'
import { describe, expect, it } from 'vitest'
import { ReportSections } from '../../app/app/[churchId]/diagnosis/report/sections'
import { assembleFallbackOnly } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import { loadMethodology } from '@/lib/methodology/load'
import { coverModel } from '@/lib/report/charts'
import { webVisuals } from '@/lib/report/web-visuals'
import { renderReportDocument } from '@/lib/report/pdf/render'
import { WEAK_ITEMS_SHOWN } from '@/lib/report/blocks'
import { FULL_ITEM_MAP_FACTS } from '../fixtures/facts'

/**
 * The combination six sessions of tests never covered: section 7 with `source === 'ai'`.
 *
 * s7 IS an AI section (lib/ai/sections.ts AI_SECTION_IDS) and prose is on whenever
 * OPENAI_API_KEY is set (lib/ai/prose-mode.ts), so the AI path is the LIVE path on a private
 * report. Both S7Views render only the model's `narrative` + `pattern_claim` and drop
 * `fallback.bullets` — which is where the areas-needing-work punch list used to live, so on
 * every real report it rendered nowhere at all.
 *
 * The punch list is DETERMINISTIC content, not model output, so it rides the same
 * source-independent seam `charts` already does: no renderer can drop it by taking the AI branch.
 *
 * Fixture is FULL_ITEM_MAP_FACTS, not CAPACITY_FACTS: needles drawn from a pack whose item
 * universe is its own six `bottom_items` also appear in s7's rank-list chart, which would make
 * every assertion here pass without the punch list rendering at all.
 */

const methodology = loadMethodology()
const facts = FULL_ITEM_MAP_FACTS
const AI_S7 = { narrative: 'AI S7 NARRATIVE', pattern_claim: 'AI S7 PATTERN CLAIM' }

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const bottomIds = new Set(facts.bottom_items.map((b) => b.item_id))
const worst = facts.improvement.areas_needing_work[0]!
/** The head sentence appears nowhere else in the report — the strongest non-vacuous needle. */
const HEAD = `${worst.name} — ${worst.score} out of 100, ${worst.gap_to_standard} points below the standard of ${facts.improvement.standard}.`

function assembled(): AssembledSection[] {
  return assembleFallbackOnly({ facts, methodology, reflections: [], audience: 'screen' })
}

/** The assembled report with s7 flipped to the AI path — everything else untouched. */
function withAiS7(sections: AssembledSection[]): AssembledSection[] {
  return sections.map((s) => (s.id === 's7' ? { ...s, source: 'ai' as const, ai: AI_S7 } : s))
}

const onlyS7 = (sections: AssembledSection[]) => sections.filter((s) => s.id === 's7')

function renderWeb(sections: AssembledSection[]): string {
  return renderToStaticMarkup(
    createElement(ReportSections, { sections, band: 'watch' as const, visuals: webVisuals(facts, methodology) }),
  )
}

async function renderPdfText(sections: AssembledSection[]): Promise<string> {
  const buffer = await renderReportDocument({
    sections,
    churchName: 'Test Church',
    brandColor: '#8E2B3E',
    monogram: 'TC',
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    labels: [],
    stale: false,
    cover: coverModel(facts, methodology),
  })
  const parser = new PDFParse({ data: buffer })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

describe('S7 punch list survives the AI path', () => {
  it('fixture guard: eight sub-standard areas, each with weak questions outside the bottom six', () => {
    const areas = facts.improvement.areas_needing_work
    expect(areas).toHaveLength(8)
    const beyondBottomSix = areas.filter((a) => a.weak_items.some((i) => !bottomIds.has(i.item_id)))
    expect(beyondBottomSix.length).toBeGreaterThan(1)
  })

  it('names every sub-standard area on the WEB when s7 renders as AI prose', () => {
    const html = renderWeb(onlyS7(withAiS7(assembled())))
    // Non-vacuity: we really are on the AI branch, not silently reading the fallback bullets.
    expect(html).toContain(AI_S7.narrative)
    const missing = facts.improvement.areas_needing_work
      .map((a) => a.name)
      .filter((name) => !html.includes(escapeHtml(name)))
    expect(missing).toEqual([])
  })

  it("keeps each area's score and gap to the standard on the WEB AI path", () => {
    const html = renderWeb(onlyS7(withAiS7(assembled())))
    expect(html).toContain(escapeHtml(HEAD))
  })

  it("keeps an area's own weak questions on the WEB AI path, including ones outside the bottom six", () => {
    const html = renderWeb(onlyS7(withAiS7(assembled())))
    const beyond = facts.improvement.areas_needing_work
      .flatMap((a) => a.weak_items.filter((i) => !bottomIds.has(i.item_id)).slice(0, 1))
      .slice(0, 4)
    expect(beyond.length).toBeGreaterThan(1) // guard
    const missing = beyond.map((i) => i.text).filter((text) => !html.includes(escapeHtml(text)))
    expect(missing).toEqual([])
  })

  it('names every sub-standard area in the PDF when s7 renders as AI prose', async () => {
    const text = await renderPdfText(withAiS7(assembled()))
    expect(text).toContain(AI_S7.narrative)
    // Whitespace in extracted PDF text follows the line wrap, so match on the head's own
    // distinctive tail rather than the whole sentence.
    expect(text.replace(/\s+/g, ' ')).toContain(
      `${worst.gap_to_standard} points below the standard of ${facts.improvement.standard}`,
    )
  })

  it('introduces the punch list on both surfaces, without help from the AI prose', async () => {
    const heading = `Every area below the standard of ${facts.improvement.standard}, weakest first.`
    expect(renderWeb(onlyS7(withAiS7(assembled())))).toContain(escapeHtml(heading))
    expect((await renderPdfText(withAiS7(assembled()))).replace(/\s+/g, ' ')).toContain(heading)
  })

  it('never hides the questions it did not print — the overflow note reaches the WEB AI path', () => {
    const html = renderWeb(onlyS7(withAiS7(assembled())))
    const notes = facts.improvement.areas_needing_work
      .map((a) => a.weak_items.length - WEAK_ITEMS_SHOWN)
      .filter((hidden) => hidden > 0)
      .map((hidden) => `And ${hidden} more questions in this area below the standard.`)
    expect(notes.length).toBeGreaterThan(0) // fixture guard
    expect(notes.filter((note) => !html.includes(escapeHtml(note)))).toEqual([])
  })

  it('reads in the same order on both surfaces: the six lowest questions, then the punch list', async () => {
    // The web renders charts around the prose (SectionVisualsBelow); the PDF renders every chart
    // above the section body. Blocks must land after BOTH so the rank list precedes the punch
    // list either way — otherwise the web reader crosses ~3,700 characters of areas to reach the
    // six lowest questions the prose just talked about.
    const heading = `Every area below the standard of ${facts.improvement.standard}, weakest first.`
    const sixth = facts.bottom_items[0]!.text

    const html = renderWeb(onlyS7(withAiS7(assembled())))
    expect(html.indexOf(escapeHtml(sixth))).toBeGreaterThan(-1)
    expect(html.indexOf(escapeHtml(heading))).toBeGreaterThan(html.indexOf(escapeHtml(sixth)))

    // The PDF's rank list is SVG, and pdf-parse extracts SVG glyphs character-spaced, so its
    // question text is not a reliable needle. What IS assertable is the half this change owns:
    // blocks render after SectionContent, and document.tsx renders every chart above it — so
    // narrative-before-punch-list on the PDF is the same relative order the web now has.
    const text = (await renderPdfText(withAiS7(assembled()))).replace(/\s+/g, ' ')
    expect(text.indexOf(AI_S7.narrative)).toBeGreaterThan(-1)
    expect(text.indexOf(heading)).toBeGreaterThan(text.indexOf(AI_S7.narrative))
  })

  it('prints each area exactly once on the FALLBACK path — the punch list is never doubled', () => {
    const html = renderWeb(onlyS7(assembled()))
    expect(html.split(escapeHtml(HEAD)).length - 1).toBe(1)
  })
})
