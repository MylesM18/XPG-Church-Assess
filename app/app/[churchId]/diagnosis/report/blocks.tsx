import { THEME_FILL } from '@/lib/report/charts'
import type { PunchListBlock, SectionBlock } from '@/lib/report/blocks'

/**
 * The web half of the BLOCK seam — the prose sibling of ./charts.tsx. Consumes the same
 * SectionBlock the PDF renderer does (lib/report/pdf/blocks.tsx) and composes no sentence of its
 * own: `head`, `line` and `note` are built once in lib/report/blocks.ts so the two surfaces
 * cannot drift. What lives here is layout only.
 *
 * Blocks render on the public share page too, and on the AI path — blocksForSection never reads
 * section.source, which is the entire reason this seam exists.
 */

const BODY = 'font-body text-base leading-[1.6] text-ink'
const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]'
const NOTE = 'font-body text-[0.8125rem] leading-[1.5] text-ink-soft'

/**
 * Every area below the standard, worst first, each over its OWN weakest questions.
 *
 * A NESTED list, not one joined sentence per area: against the real 50-question instrument a
 * church in the 50s and 60s puts nearly every question below 80, and the joined form was a
 * 650-890 character run-on sentence per area.
 */
function WebPunchList({ model }: { model: PunchListBlock }) {
  return (
    <>
      <p className={`${BODY} font-semibold`}>{model.heading}</p>
      <ol role="list" className="flex flex-col gap-5" aria-label="Areas below the standard, weakest first">
        {model.areas.map((area) => (
          <li key={area.category_id} className="flex flex-col gap-2 border-t border-line pt-3">
            <p className={`${BODY} font-semibold`}>{area.head}</p>
            {area.items.length > 0 && (
              <ul role="list" className="flex flex-col gap-1 pl-4">
                {area.items.map((item) => (
                  <li key={item.item_id} className="flex flex-col">
                    <span className="font-body text-[0.8125rem] leading-[1.5] text-ink">{item.line}</span>
                    <span className={`${CAPS} mt-0.5`} style={{ color: THEME_FILL[item.theme] }}>
                      {item.theme.toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* Running prose, NOT a caps label: the note is a sentence, and CAPS carries
                `uppercase`, which shouted it on the web while the PDF set the same string in
                sentence case with letter-spacing. Same string, two typographic registers. */}
            {area.note !== null && <p className={`${NOTE} pl-4`}>{area.note}</p>}
          </li>
        ))}
      </ol>
    </>
  )
}

export function WebBlock({ model }: { model: SectionBlock }) {
  switch (model.kind) {
    case 'punch_list':
      return <WebPunchList model={model} />
    default: {
      // ./charts.tsx writes `never = model`, which needs a 2+ member union to narrow;
      // SectionBlock has one member today, so the DISCRIMINANT carries the tsc check instead.
      // Returning null rather than `_exhaustive` matters: returning it would print the raw kind
      // string as visible text on a public page (see sections.tsx's SectionVisualsAbove).
      const _exhaustive: never = model.kind
      void _exhaustive
      return null
    }
  }
}
