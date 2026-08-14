import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '@/lib/ai/sections'
import type { AiSectionId } from '@/lib/ai/sections'
import type { AssembledSection } from '@/lib/report/compose'
import type { SectionBody } from '@/lib/report/fallback-sections'
import { WebChart } from './charts'

/**
 * The uniform renderer: the { body, bullets } half of a SectionBody. Used for all 13
 * sections on the public share page, and for every source:'fallback' section on the
 * diagnosis page. The title is rendered by ReportSections, never here — one title
 * source for both branches.
 */
export function SectionBodyView({ body, bullets }: { body: string; bullets: string[] }) {
  return (
    <>
      <p className="font-body text-ink-soft">{body}</p>
      {bullets.length > 0 && (
        <ul className="font-body text-ink-soft">
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
      <p className="font-body text-ink-soft">{summary}</p>
      <p className="font-body text-ink-soft">{what_this_is_not}</p>
      {context_bullets.length > 0 && (
        <ul className="font-body text-ink-soft">
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
      <p className="font-display text-ink">{thesis_word}</p>
      <p className="font-body text-ink-soft">{narrative}</p>
    </>
  )
}

function S5View({ ai, fallback }: AiRendererProps) {
  const parsed = S5Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.strengths.map((strength) => (
        <div key={strength.category_id}>
          <p className="font-display text-ink">{strength.heading}</p>
          <p className="font-body text-ink-soft">{strength.body}</p>
        </div>
      ))}
    </div>
  )
}

function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = S6Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.areas.map((area) => (
        <div key={area.category_id}>
          <p className="font-body text-ink-soft">{area.affirm}</p>
          <p className="font-body text-ink-soft">{area.pivot}</p>
          <p className="font-body text-ink-soft">{area.evidence}</p>
          <p className="font-body text-ink-soft">{area.not_statement}</p>
          <p className="font-body text-ink-soft">{area.reframe}</p>
          <p className="font-body text-ink-soft">{area.trajectory}</p>
        </div>
      ))}
    </div>
  )
}

function S7View({ ai, fallback }: AiRendererProps) {
  const parsed = S7Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, pattern_claim } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{narrative}</p>
      {pattern_claim !== null && <p className="font-body text-ink-soft">{pattern_claim}</p>}
    </>
  )
}

function S9View({ ai, fallback }: AiRendererProps) {
  const parsed = S9Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, working_model } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{narrative}</p>
      <p className="font-body text-ink-soft">{working_model}</p>
    </>
  )
}

function S12View({ ai, fallback }: AiRendererProps) {
  const parsed = S12Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { assessment, overall_percent, tier_name, primary_objective } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{assessment}</p>
      <ul className="font-body text-ink-soft">
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
 * one of the seven AI sections, the shared deterministic view otherwise.
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
function SectionContent({ section }: { section: AssembledSection }) {
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
        return <S6View ai={ai} fallback={fallback} />
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
 * Renders the 13 report sections and nothing else. Page chrome — the church-identity
 * block, the not-scoreable notice, the admin controls, the booking CTA, the shared-view
 * footer — stays on the pages.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport and
 * assembleFallbackOnly both return them in Object.keys(methodology.report.sections)
 * order, which is report.yaml order.
 *
 * The heading always comes from section.fallback.title, which fallbackSection copies
 * verbatim from report.yaml. AI renderers emit body content only and never their own
 * heading.
 *
 * ⚠️ The first section renders <h1> and the rest render <h2>, written as two literal
 * branches. tests/a11y/shared-report-heading.test.ts counts `<h1` in this file's SOURCE
 * TEXT — a dynamic tag would produce zero literal matches and read as "no h1 anywhere"
 * on a public page whose document outline depends on it.
 */
export function ReportSections({ sections }: { sections: AssembledSection[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <section key={section.id} className="flex flex-col gap-8 max-w-2xl">
          {index === 0 ? (
            <h1 className="font-display text-ink">{section.fallback.title}</h1>
          ) : (
            <h2 className="font-display text-ink">{section.fallback.title}</h2>
          )}
          {section.charts.map((chart) => (
            <WebChart key={chart.kind} model={chart} />
          ))}
          <SectionContent section={section} />
        </section>
      ))}
    </>
  )
}
