import { Fragment } from 'react'
import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '@/lib/ai/sections'
import type { AiSectionId } from '@/lib/ai/sections'
import type { AssembledSection } from '@/lib/report/compose'
import type { SectionBody } from '@/lib/report/fallback-sections'
import { BAND_FILL, BAND_TEXT, BAND_NAME, textOnBand, areaIndexFrom } from '@/lib/report/charts'
import type { AreaIndex, BandKey, ChartModel } from '@/lib/report/charts'
import { bookingCta } from '@/lib/report/cta'
import type { PhaseRailModel, WebVisuals } from '@/lib/report/web-visuals'
import { WebChart } from './charts'
import {
  WebCapacityBars,
  WebChainRail,
  WebConfidence,
  WebConstraintCallout,
  WebDumbbells,
  WebPhaseRail,
  WebSpread,
  WebThemeSplit,
} from './web-visuals'

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
// text-ink and text-ink-soft are real Tailwind tokens in this repo (charts.tsx uses both), but
// there is no proven bg-ink, so the 2px section rule sets its colour inline.
const INK = '#1A1A18'

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
 * The six beats of an area read, labelled on the web only (spec §6.1). Six
 * unlabelled paragraphs read as one undifferentiated block; the labels are
 * chrome, and the paragraphs themselves are byte-identical to the PDF's.
 */
const S6_BEATS = [
  { key: 'affirm', label: "What's working" },
  { key: 'pivot', label: 'Where it turns' },
  { key: 'evidence', label: 'The evidence' },
  { key: 'not_statement', label: 'What this is not' },
  { key: 'reframe', label: 'Another way to see it' },
  { key: 'trajectory', label: 'If nothing changes' },
] as const

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
            {S6_BEATS.map((beat) => (
              <div
                key={beat.key}
                className="grid gap-1 border-t border-line pt-2 sm:grid-cols-[7rem_1fr] sm:gap-4"
              >
                <p className={`${CAPS} text-ink-soft`}>{beat.label}</p>
                <p className={BODY}>{area[beat.key]}</p>
              </div>
            ))}
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
 * Per-section visual placement (spec §5.2). Replaces the blind
 * `section.charts.map` that used to render every chart in one slot above the
 * body — the new layout needs some visuals above the prose and some below it,
 * and needs to interleave the two rebuilt charts with a new HTML component.
 *
 * Sections with no explicit placement keep exactly today's behaviour: all of
 * their charts, above the body, in model order.
 *
 * LITERAL COMPONENT TAGS ONLY, `never` in every default — see the doc comment at
 * the top of SectionContent. A Map/lookup of component identifiers is a real
 * react-hooks/static-components error in this repo, not a style preference.
 */
type AboveId = 's3' | 's4' | 's7' | 's9'
type BelowId = 's4' | 's7' | 's8' | 'appendix'

/**
 * `as const satisfies readonly AboveId[]` / `readonly BelowId[]` is load-bearing, not tidiness.
 * Typed as `readonly string[]` these arrays drifted from the unions silently: an id added here
 * without a matching `case` below still passed the `.includes` guard, fell through to the
 * `never` default, and RETURNED `section.id` — which React renders as a visible text node, i.e.
 * a raw section id printed on a public page. `satisfies` makes tsc, not a reader, catch that.
 *
 * `.includes(section.id)` then needs the widening cast back to `readonly string[]`: section.id
 * is a SectionId, which is deliberately WIDER than these unions (that is the whole point of the
 * guard), and a `readonly AboveId[]`'s `includes` only accepts an AboveId. The cast is on the
 * array, never on section.id — narrowing the argument instead would be the same silent lie this
 * comment exists to prevent. Runtime behaviour is unchanged: same values, same order.
 */
const ABOVE_IDS = ['s3', 's4', 's7', 's9'] as const satisfies readonly AboveId[]
const BELOW_IDS = ['s4', 's7', 's8', 'appendix'] as const satisfies readonly BelowId[]

function chartOfKind(section: AssembledSection, kind: ChartModel['kind']) {
  return section.charts.find((chart) => chart.kind === kind) ?? null
}

function SectionVisualsAbove({
  section,
  visuals,
}: {
  section: AssembledSection
  visuals: WebVisuals
}) {
  if (!(ABOVE_IDS as readonly string[]).includes(section.id)) {
    return (
      <>
        {section.charts.map((chart) => (
          <WebChart key={chart.kind} model={chart} />
        ))}
      </>
    )
  }

  const verdict = chartOfKind(section, 'verdict_block')
  const statGrid = chartOfKind(section, 'stat_grid')

  switch (section.id as AboveId) {
    case 's3':
      return (
        <>
          {verdict ? <WebChart model={verdict} /> : null}
          <WebCapacityBars model={visuals.s3.capacity} />
          {statGrid ? <WebChart model={statGrid} /> : null}
        </>
      )
    case 's4':
      return visuals.s4.constraint ? (
        <WebConstraintCallout model={visuals.s4.constraint} />
      ) : null
    case 's7':
      return visuals.s7.themeSplit ? <WebThemeSplit model={visuals.s7.themeSplit} /> : null
    case 's9':
      return <WebChainRail model={visuals.s9.chain} />
    default: {
      const exhaustive: never = section.id as never
      return exhaustive
    }
  }
}

/**
 * The confidence meter's case is 'appendix', not 's13'. The MODEL's own key is
 * `visuals.s13` (spec §5.1's 13th-section numbering), but the runtime SectionId of the
 * last section is 'appendix' (methodology/schema.ts) — there is no 's13' section id, so
 * a `case 's13'` here would never match and the meter would silently vanish. The id and
 * the model key differ on purpose.
 */
function SectionVisualsBelow({
  section,
  visuals,
}: {
  section: AssembledSection
  visuals: WebVisuals
}) {
  if (!(BELOW_IDS as readonly string[]).includes(section.id)) return null

  const rankList = chartOfKind(section, 'rank_list')

  switch (section.id as BelowId) {
    case 's4':
      return visuals.s4.dumbbells ? <WebDumbbells model={visuals.s4.dumbbells} /> : null
    case 's7':
      return rankList ? <WebChart model={rankList} /> : null
    case 's8':
      return visuals.s8.spread ? <WebSpread model={visuals.s8.spread} /> : null
    case 'appendix':
      return <WebConfidence model={visuals.s13.confidence} />
    default: {
      const exhaustive: never = section.id as never
      return exhaustive
    }
  }
}

/**
 * s10 renders its roadmap as the phase rail instead of a bullet list (spec §6.6).
 * The body paragraph is untouched; the rail is handed the FULL bullet array and
 * subtracts model.supersedes itself, so s10Bullets' extra `Do not work on yet:`
 * line survives verbatim beneath the rail.
 */
function S10PhaseBody({
  section,
  model,
}: {
  section: AssembledSection
  model: PhaseRailModel
}) {
  return (
    <div className="flex flex-col gap-4">
      {section.fallback.body ? <p className={BODY}>{section.fallback.body}</p> : null}
      <WebPhaseRail model={model} bullets={section.fallback.bullets} />
    </div>
  )
}

/**
 * Renders the 13 report sections as the web mirror of the PDF's content pages (Part B spec):
 * each section opens with editorial chrome — a 3px BAND_FILL[band] tick, an `NN / TOTAL` caps
 * eyebrow, the title, then a 2px INK rule — then its charts, then its content; the booking CTA
 * renders once, immediately after s12, where document.tsx puts it. Page chrome — the toolbar,
 * the notices, the cover, the shared-view footer — stays on the pages. `band` is the cover's
 * verdict band (`cover.band`): the colour IS the diagnosis, and every opener's tick wears it.
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
 */
export function ReportSections({ sections, band, visuals }: { sections: AssembledSection[]; band: BandKey; visuals: WebVisuals }) {
  const areaIndex = areaIndexFrom(sections)
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.id}>
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="h-[22px] w-[3px] shrink-0"
                  style={{ backgroundColor: BAND_FILL[band] }}
                />
                <p className={`${CAPS} text-ink-soft`}>
                  {`${String(index + 1).padStart(2, '0')} / ${sections.length}`}
                </p>
              </div>
              {index === 0 ? (
                <h1 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h1>
              ) : (
                <h2 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h2>
              )}
              <span aria-hidden className="h-[2px] w-full" style={{ backgroundColor: INK }} />
            </div>
            <SectionVisualsAbove section={section} visuals={visuals} />
            {section.id === 's10' && visuals.s10.phaseRail ? (
              <S10PhaseBody section={section} model={visuals.s10.phaseRail} />
            ) : (
              <SectionContent section={section} areaIndex={areaIndex} />
            )}
            <SectionVisualsBelow section={section} visuals={visuals} />
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
