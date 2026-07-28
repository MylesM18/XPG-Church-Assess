// app/app/[churchId]/diagnosis/report/system.tsx
import type { SystemView } from '@/lib/report/view'
import type { EdgeRead } from '@/lib/engine/dependencies'

// `satisfies readonly EdgeRead[]`, not just `as const`: SystemView.dependencies[].read is
// widened to plain `string` (lib/report/view.ts), so without this every value here was
// unchecked against the real EdgeRead union — a typo'd or since-renamed read value would
// compile silently and that edge would simply vanish from every group in DependencyMap below,
// never rendered, with nothing to catch it. This makes an invalid entry a compile error instead.
const READ_ORDER = ['load_bearing', 'at_risk', 'clear', 'both_strong'] as const satisfies readonly EdgeRead[]

const READ_LABEL: Record<string, string> = {
  load_bearing: 'Load-bearing',
  at_risk: 'At risk',
  clear: 'Clear',
  both_strong: 'Both holding',
}

/**
 * The read-specific half of a dependency row (spec §6.1's table, worked example:
 * "Systems (74) gates Volunteers (48). Systems is holding — so systems is not
 * what's capping your volunteers." — that sentence is the 'clear' case below,
 * reproduced verbatim; the other three reads are symmetric constructions off
 * the same spec language ("active and costing you" / "running on borrowed
 * time" / "nothing to say").
 */
function readSentence(fromName: string, toName: string, read: string): string {
  const fLower = fromName.toLowerCase()
  const tLower = toName.toLowerCase()
  switch (read) {
    case 'load_bearing':
      return `${fromName} is weak here too — this dependency is active and part of what's costing you.`
    case 'clear':
      return `${fromName} is holding — so ${fLower} is not what's capping your ${tLower}.`
    case 'at_risk':
      return `${toName} is holding for now, but ${fLower} is weak — it's running on borrowed time.`
    default: // 'both_strong'
      return 'Both are holding — nothing to flag here.'
  }
}

function relationshipLine(e: SystemView['dependencies'][number]): string {
  const verb = e.kind === 'gate' ? 'gates' : 'feeds'
  return `${e.fromName} (${e.fromScore}) ${verb} ${e.toName} (${e.toScore}). ${readSentence(e.fromName, e.toName, e.read)}`
}

/**
 * All 13 authored edges (methodology/rules.yaml), grouped by how this church's
 * actual scores read against each one, leading with load_bearing — the most
 * actionable group (spec §6.1). Measured correlation annotations attach to
 * their matching edge when present and are simply absent otherwise: the
 * authored map is the cake, correlation is the cherry (spec §6.3). The rare
 * 'unexpected' correlations — by construction never on an authored edge, since
 * they come from the non-authored exploratory pairs — surface in their own
 * short section beneath, since spec §6.3 calls them out as the highest-value
 * output when they do appear.
 */
export function DependencyMap({ system }: { system: SystemView }) {
  const byRead = new Map<string, SystemView['dependencies']>()
  for (const e of system.dependencies) {
    const list = byRead.get(e.read) ?? []
    list.push(e)
    byRead.set(e.read, list)
  }

  const names = new Map<string, string>()
  for (const e of system.dependencies) {
    names.set(e.from, e.fromName)
    names.set(e.to, e.toName)
  }
  const unexpected = system.correlations.filter((c) => c.verdict === 'unexpected')

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl text-ink">How your areas depend on each other</h2>
      {READ_ORDER.map((read) => {
        const edges = byRead.get(read)
        if (!edges || edges.length === 0) return null
        return (
          <div key={read} className="flex flex-col gap-2">
            <h3 className="font-display text-base text-ink">{READ_LABEL[read]}</h3>
            <ul className="flex flex-col gap-2">
              {edges.map((e) => {
                const corr = system.correlations.find(
                  (c) => (c.from === e.from && c.to === e.to) || (c.from === e.to && c.to === e.from),
                )
                return (
                  <li key={`${e.from}-${e.to}`} className="flex flex-col gap-0.5">
                    <p className="font-body text-sm text-ink-soft">{e.statement}</p>
                    <p className="font-body text-ink">{relationshipLine(e)}</p>
                    {corr && (
                      <p className="font-body text-xs text-ink-soft">
                        {`Correlation ${corr.verdict.replace('_', ' ')} — r=${corr.r.toFixed(2)} (n=${corr.n})`}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {unexpected.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-base text-ink">Unexpected findings</h3>
          <ul className="flex flex-col gap-1">
            {unexpected.map((c) => (
              <li key={`${c.from}-${c.to}`} className="font-body text-sm text-ink">
                {`${names.get(c.from) ?? c.from} ↔ ${names.get(c.to) ?? c.to}: r=${c.r.toFixed(2)} (n=${c.n})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * Rating-style spread, unnamed on every surface (spec §7.5 decision 7): only a
 * pre-interpolated sentence crosses this component's props, so it cannot carry
 * a respondent name even by accident. `spread` stays part of the signature
 * (matching the interface `Calibration({ spread, text })`) even though the
 * body no longer prints it a second time: `text` already has it interpolated
 * (methodology/copy.yaml's `calibration_spread` template, applied in
 * lib/report/view.ts's `calibrationText`), so a second "Spread: N points"
 * line here was a duplicate of the same number, not a second fact.
 */
export function Calibration({ text }: { spread: number; text: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-xl text-ink">Calibration</h2>
      <p className="font-body text-ink">{text}</p>
    </section>
  )
}

export function GatingFlags({ text }: { text: string }) {
  // Flags never headline — a muted secondary note (spec §6.2 row 6).
  return (
    <section className="flex flex-col gap-1">
      <p className="font-body text-sm text-ink-soft">{text}</p>
    </section>
  )
}

export function Disagreement({
  text, respondents,
}: {
  text: string
  respondents: Array<{ label: string; mean: number }>
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Where your leaders disagree</h2>
      <p className="font-body text-ink">{text}</p>
      {respondents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respondents.map((r) => (
            <li key={r.label} className="font-body text-sm text-ink-soft">
              {r.label}: {r.mean.toFixed(1)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
