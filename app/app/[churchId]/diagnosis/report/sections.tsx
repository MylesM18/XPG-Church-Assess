import { Fragment } from 'react'
import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '@/lib/ai/sections'
import type { AiSectionId } from '@/lib/ai/sections'
import type { AssembledSection } from '@/lib/report/compose'
import type { SectionBody } from '@/lib/report/fallback-sections'
import { BAND_FILL, BAND_TEXT, BAND_NAME, textOnBand, areaIndexFrom } from '@/lib/report/charts'
import type { AreaIndex, BandKey } from '@/lib/report/charts'
import { bookingCta } from '@/lib/report/cta'
import { WebChart } from './charts'

// Type ramp (Part B spec §4.1), the web mapping of the PDF's poster ramp: body 1rem/1.6 in INK
// (the PDF sets body in INK; ink-soft is for caps labels only), AI sub-heads display 600
// 1.0625rem, caps labels 0.6875rem 700 tracked, opener titles display 600 fluid 1.5rem to
// 2.125rem at line-height 1.2. Shared constants so the seven AI views cannot drift from
// SectionBodyView.
const BODY = 'font-body text-base leading-[1.6] text-ink'
const LIST = 'list-disc space-y-1 pl-5 font-body text-base leading-[1.6] text-ink'
const SUBHEAD = 'font-display text-[1.0625rem] font-semibold text-ink'
const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]'
const OPENER_TITLE = 'font-display font-semibold leading-[1.2]'
const OPENER_TITLE_SIZE = { fontSize: 'clamp(1.5rem, 4vw, 2.125rem)' } as const

/**
 * The uniform renderer: the { body, bullets } half of a SectionBody. Used for all 13
 * sections on the public share page, and for every source:'fallback' section on the
 * diagnosis page. The title is rendered by ReportSections, never here — one title
 * source for both branches. Bullets are a real <ul> with disc markers (no bullet glyph in
 * the text, unlike the PDF's Text-only primitives).
 */
export function SectionBodyView({ body, bullets }: { body: string; bullets: string[] }) {
  return (
    <>
      <p className={BODY}>{body}</p>
      {bullets.length > 0 && (
        <ul className={LIST}>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </>
  )
}

type AiRendererProps = { ai: unknown; fallback: SectionBody }

/** Every AI renderer's failure path: the section's own deterministic fallback. */
function AiFallback({ fallback }: { fallback: SectionBody }) {
  return <SectionBodyView body={fallback.body} bullets={fallback.bullets} />
}

function S2View({ ai, fallback }: AiRendererProps) {
  const parsed = S2Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { summary, what_this_is_not, context_bullets } = parsed.data
  return (
    <>
      <p className={BODY}>{summary}</p>
      <p className={BODY}>{what_this_is_not}</p>
      {context_bullets.length > 0 && (
        <ul className={LIST}>
          {context_bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function S4View({ ai, fallback }: AiRendererProps) {
  const parsed = S4Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { thesis_word, narrative } = parsed.data
  return (
    <>
      <p className={SUBHEAD}>{thesis_word}</p>
      <p className={BODY}>{narrative}</p>
    </>
  )
}

function S5View({ ai, fallback }: AiRendererProps) {
  const parsed = S5Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.strengths.map((strength) => (
        <div key={strength.category_id} className="flex flex-col gap-1">
          <p className={SUBHEAD}>{strength.heading}</p>
          <p className={BODY}>{strength.body}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Web mirror of the PDF's S6View: each dossier opens with a head — band tab (caps label on
 * BAND_FILL, textOnBand), area name, score in BAND_TEXT — looked up from `areaIndex`, the s3
 * stat grid indexed by category id (one source of truth, no recompute). An area missing from
 * the index renders its six beats with no head, exactly like the PDF.
 */
function S6View({ ai, fallback, areaIndex }: AiRendererProps & { areaIndex: AreaIndex }) {
  const parsed = S6Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.areas.map((area) => {
        const meta = areaIndex.get(area.category_id)
        return (
          <div key={area.category_id} className="flex flex-col gap-2">
            {meta && (
              <div className="flex items-center gap-3">
                <span
                  className={`px-1.5 py-0.5 ${CAPS}`}
                  style={{ backgroundColor: BAND_FILL[meta.band], color: textOnBand(meta.band) }}
                >
                  {BAND_NAME[meta.band].toUpperCase()}
                </span>
                <p className={`grow ${SUBHEAD}`}>{meta.name}</p>
                <p className="font-display text-2xl font-semibold" style={{ color: BAND_TEXT[meta.band] }}>
                  {String(meta.score)}
                </p>
              </div>
            )}
            <p className={BODY}>{area.affirm}</p>
            <p className={BODY}>{area.pivot}</p>
            <p className={BODY}>{area.evidence}</p>
            <p className={BODY}>{area.not_statement}</p>
            <p className={BODY}>{area.reframe}</p>
            <p className={BODY}>{area.trajectory}</p>
          </div>
        )
      })}
    </div>
  )
}

function S7View({ ai, fallback }: AiRendererProps) {
  const parsed = S7Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, pattern_claim } = parsed.data
  return (
    <>
      <p className={BODY}>{narrative}</p>
      {pattern_claim !== null && <p className={BODY}>{pattern_claim}</p>}
    </>
  )
}

function S9View({ ai, fallback }: AiRendererProps) {
  const parsed = S9Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, working_model } = parsed.data
  return (
    <>
      <p className={BODY}>{narrative}</p>
      <p className={BODY}>{working_model}</p>
    </>
  )
}

function S12View({ ai, fallback }: AiRendererProps) {
  const parsed = S12Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { assessment, overall_percent, tier_name, primary_objective } = parsed.data
  return (
    <>
      <p className={BODY}>{assessment}</p>
      <ul className={LIST}>
        <li>{`Overall: ${overall_percent}%`}</li>
        <li>{`Tier: ${tier_name}`}</li>
        <li>{`Primary objective: ${primary_objective}`}</li>
      </ul>
    </>
  )
}

/**
 * Narrows `section.id: SectionId` (13 possible values) down to `AiSectionId` (the 7 that have
 * a renderer). The co-occurrence of `source === 'ai'` with one of these ids is a compose.ts
 * runtime invariant, not something the type system tracks on its own — this is the type guard
 * that recovers it for the switch below.
 */
function isAiSectionId(id: AssembledSection['id']): id is AiSectionId {
  return (AI_SECTION_IDS as readonly string[]).includes(id)
}

/**
 * Dispatches a section's body content: its own AI renderer when source is 'ai' and that id is
 * one of the seven AI sections, the shared deterministic view otherwise. `areaIndex` is
 * computed once in ReportSections and threaded down exactly as document.tsx does.
 *
 * Deviation from a Map/Record lookup assigned to a variable and rendered as `<Renderer .../>`:
 * eslint's `react-hooks/static-components` rule flags any JSX tag whose identifier traces back
 * to a CallExpression/MethodCall (here, `Map.get(...)`) as "a component created during render,"
 * even though the value returned is always one of these already-hoisted, module-level
 * functions — a false positive, but a real one (verified: `npx eslint` errors on it). A switch
 * with a literal component tag per case avoids that pattern entirely, while the `never` check
 * in the default arm keeps the same compile-time guarantee the Record approach was for: add an
 * eighth id to `AiSectionId` without a case here, and tsc — not a human — fails the build.
 */
function SectionContent({ section, areaIndex }: { section: AssembledSection; areaIndex: AreaIndex }) {
  if (section.source === 'ai' && isAiSectionId(section.id)) {
    const { id, ai, fallback } = section
    switch (id) {
      case 's2':
        return <S2View ai={ai} fallback={fallback} />
      case 's4':
        return <S4View ai={ai} fallback={fallback} />
      case 's5':
        return <S5View ai={ai} fallback={fallback} />
      case 's6':
        return <S6View ai={ai} fallback={fallback} areaIndex={areaIndex} />
      case 's7':
        return <S7View ai={ai} fallback={fallback} />
      case 's9':
        return <S9View ai={ai} fallback={fallback} />
      case 's12':
        return <S12View ai={ai} fallback={fallback} />
      default: {
        const _exhaustive: never = id
        return _exhaustive
      }
    }
  }
  return <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />
}

/**
 * Renders the 13 report sections as the web mirror of the PDF's content pages (Part B spec):
 * each section opens with a band-tinted opener (BAND_FILL[band] box, number 01..13 as a caps
 * label over the title in textOnBand), then its charts, then its content; the booking CTA
 * renders once, immediately after s12, where document.tsx puts it. Page chrome — the toolbar,
 * the notices, the cover, the shared-view footer — stays on the pages. `band` is the cover's
 * verdict band (`cover.band`): the colour IS the diagnosis, and every opener wears it.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport and
 * assembleFallbackOnly both return them in Object.keys(methodology.report.sections)
 * order, which is report.yaml order.
 *
 * The heading always comes from section.fallback.title, which fallbackSection copies
 * verbatim from report.yaml. AI renderers emit body content only and never their own
 * heading.
 *
 * The first section renders <h1> and the rest render <h2>, written as two literal
 * branches. tests/a11y/shared-report-heading.test.ts counts `<h1` in this file's SOURCE
 * TEXT — a dynamic tag would produce zero literal matches and read as "no h1 anywhere"
 * on a public page whose document outline depends on it. The cover's church name is a <p>.
 *
 * Openers bleed to the viewport on narrow screens (-mx-6 inside the pages' px-6 main) with
 * their text kept on the body column (px-6), and sit inside the column with the PDF's 16px
 * inset (px-4) from sm up.
 */
export function ReportSections({ sections, band }: { sections: AssembledSection[]; band: BandKey }) {
  const areaIndex = areaIndexFrom(sections)
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.id}>
          <section className="flex flex-col gap-6">
            <div
              className="-mx-6 px-6 py-3 sm:mx-0 sm:px-4"
              style={{ backgroundColor: BAND_FILL[band], color: textOnBand(band) }}
            >
              <p className={CAPS}>{String(index + 1).padStart(2, '0')}</p>
              {index === 0 ? (
                <h1 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h1>
              ) : (
                <h2 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h2>
              )}
            </div>
            {section.charts.map((chart) => (
              <WebChart key={chart.kind} model={chart} />
            ))}
            <SectionContent section={section} areaIndex={areaIndex} />
          </section>
          {section.id === 's12' && (
            <div className="flex flex-col items-start gap-2">
              <p className={SUBHEAD}>{bookingCta.heading}</p>
              <p className={BODY}>{bookingCta.body}</p>
              <a
                href={bookingCta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center rounded-md bg-ink px-4 py-2 font-display text-sm text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {bookingCta.buttonLabel}
              </a>
            </div>
          )}
        </Fragment>
      ))}
    </>
  )
}
