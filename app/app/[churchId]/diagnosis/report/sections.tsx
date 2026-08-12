import type { AssembledSection } from '@/lib/report/compose'

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
          <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />
        </section>
      ))}
    </>
  )
}
