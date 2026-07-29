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
  both_strong: 'Both strong',
}

// A colored status pill per group (spec §3). Tokens live in app/globals.css @theme
// (--color-berry etc., surfaced as Tailwind utilities): load-bearing is the most
// actionable, constraint-adjacent group → berry (its reserved diagnosis colour);
// at-risk → amber; clear → neutral sand; both-strong → sage (the healthy colour).
const READ_PILL: Record<string, string> = {
  load_bearing: 'bg-berry text-paper',
  at_risk: 'bg-status-amber text-paper',
  clear: 'bg-sand text-ink',
  both_strong: 'bg-sage text-paper',
}

/**
 * The `From (n) verb → To (m)` primary line (spec §3): names, scores, the arrow, and
 * the gates/feeds verb, all structural. The read-specific sentence is NOT part of this
 * line — it is precomputed in lib/report/view.ts from methodology.copy.dependency_reads,
 * arrives on `e.readSentence`, and renders as a separate muted subline. pdf/document.tsx's
 * depRelationshipLine mirrors this byte-for-byte so the two surfaces cannot drift.
 */
function relationshipLine(e: SystemView['dependencies'][number]): string {
  const verb = e.kind === 'gate' ? 'gates' : 'feeds'
  return `${e.fromName} (${e.fromScore}) ${verb} → ${e.toName} (${e.toScore})`
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
        // When the whole group reads both_strong the read is identical on every edge
        // ("nothing to flag here" — no per-edge tokens): show it once at group level and
        // suppress the per-row subline, rather than repeating one sentence down the column.
        const groupRead = read === 'both_strong'
        return (
          <div key={read} className="flex flex-col gap-2">
            <h3 className="font-display text-base text-ink">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-xs font-medium ${READ_PILL[read]}`}
              >
                {READ_LABEL[read]}
              </span>
            </h3>
            {groupRead && edges[0] && <p className="font-body text-sm text-ink-soft">{edges[0].readSentence}</p>}
            <ul className="flex flex-col gap-3">
              {edges.map((e) => {
                const corr = system.correlations.find(
                  (c) => (c.from === e.from && c.to === e.to) || (c.from === e.to && c.to === e.from),
                )
                return (
                  <li key={`${e.from}-${e.to}`} className="flex flex-col gap-0.5">
                    <p className="font-body text-ink">{relationshipLine(e)}</p>
                    {!groupRead && <p className="font-body text-sm text-ink-soft">{e.readSentence}</p>}
                    <p className="font-body text-xs text-ink-soft">{e.statement}</p>
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
