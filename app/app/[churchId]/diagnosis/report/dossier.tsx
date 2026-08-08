// app/app/[churchId]/diagnosis/report/dossier.tsx
import type { ReactElement } from 'react'
import type { AreaDossierView } from '@/lib/report/view'

const UNAVAILABLE = 'Not available for this area.'

/**
 * One row of the six-field dossier grid (spec §7.2). A plain function — not a
 * component — called directly so its output inlines straight into AreaDossier's
 * own returned tree: tests/report/components.test.ts's walk()/textOf() helpers
 * only descend through elements a component RETURNS and never invoke a nested
 * component's body, so delegating each field to a <SubComponent/> element would
 * make it invisible to those helpers.
 *
 * A field with no value renders its label plus an explicit unavailability line,
 * never a blank (Task 15 brief, Step 3) — identical six fields on every area,
 * no exceptions (spec §7.2).
 */
function field(label: string, value: string | string[] | null): ReactElement {
  const body = Array.isArray(value)
    ? (value.length > 0 ? value.join(' · ') : UNAVAILABLE)
    : (value ?? UNAVAILABLE)
  return (
    <div key={label} className="flex flex-col gap-0.5 py-1.5">
      <dt className="font-body text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="font-body text-ink">{body}</dd>
    </div>
  )
}

/**
 * Renders fully inline — no <details>, no accordion. Collapsing the depth the
 * customer is paying for defeats the point, and the PDF/shared surfaces cannot
 * collapse anyway, so inline keeps all three surfaces identical (spec §7.8).
 */
export function AreaDossier({ area }: { area: AreaDossierView }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink">{area.name}</h3>
        <span className="font-body text-sm text-ink-soft">{area.score}</span>
      </div>
      <dl className="flex flex-col divide-y divide-line">
        {field('Reading', area.reading)}
        {field('Inside it', area.insideIt)}
        {field('Agreement', area.agreement)}
        {field('Position', area.position)}
        {field('Depends on', area.dependsOn)}
        {field('Watch for', area.watchFor)}
      </dl>
      {area.outreachVoices?.length ? (
        <div className="mt-4">
          <p className="font-body text-xs uppercase tracking-wide text-ink-soft">Voices on outreach</p>
          {area.outreachVoices.map((group) => (
            <div key={group.itemId} className="mt-2">
              <p className="font-body text-sm text-ink-soft">{group.reflectionPrompt}</p>
              {group.entries.map((entry, i) => (
                <blockquote
                  key={i}
                  className="mt-1 border-l-2 border-line pl-3 font-body text-sm text-ink break-words"
                >
                  {entry}
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
