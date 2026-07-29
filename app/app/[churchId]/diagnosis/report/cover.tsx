// app/app/[churchId]/diagnosis/report/cover.tsx
import type { CoverView, AreaDossierView } from '@/lib/report/view'

// Confidence band — UI-only presentation mapping, explicitly separate from methodology YAML
// (spec §7). Defined here rather than in shared.tsx: its only consumer is VerdictHeader below,
// and shared.tsx already imports CoverCard/VerdictHeader/AreaTable from this file for
// ReportBody's assembly — defining it in shared.tsx and importing it back here made this
// module and shared.tsx import each other (shared.tsx -> cover.tsx -> shared.tsx). It happened
// to be safe (both references are inside function bodies, never at module-init time — the value
// itself is stable regardless), but it was needless: co-locating this with its one caller
// removes the cycle instead of merely tolerating it.
function confidenceBand(c: number): { label: string; low: boolean } {
  if (c >= 0.75) return { label: 'High', low: false }
  if (c >= 0.5) return { label: 'Moderate', low: false }
  return { label: 'Low', low: true }
}

/**
 * Throughput is the single focal number; capacity/gap/constraint are a
 * supporting line beneath, never a co-headline (spec §3 decision 3, spec §5.3).
 * This is the report's page heading (h1) — the church-identity header that used
 * to live here moved out when VerdictHeader was reworked down to verdict text +
 * confidence below.
 */
export function CoverCard({ cover }: { cover: CoverView }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-lg border border-line bg-paper p-6 text-center">
      <h1 className="font-body text-sm uppercase tracking-wide text-ink-soft">Overall church health</h1>
      <p className="font-display text-5xl text-ink">{`${cover.throughput}%`}</p>
      <p className="font-body text-sm text-ink-soft">{`Capacity ${cover.capacity}  ·  Gap ${cover.gap} pts`}</p>
      <p className="font-body text-base text-ink">
        {cover.constraintName ? `Constraint: ${cover.constraintName}` : 'Constraint: none — every stage holding'}
      </p>
      {cover.gatedBy.length > 0 && (
        <p className="font-body text-sm text-berry">
          {`⚠ Gated by: ${cover.gatedBy.map((g) => `${g.name} (${g.score})`).join(', ')}`}
        </p>
      )}
    </section>
  )
}

/**
 * Reworked down to verdict sentence + confidence (spec §7 Layer 1 table). The
 * church name/monogram/throughput this used to also show are now redundant
 * with CoverCard directly above it — throughput already has its one focal
 * home there (spec §3 decision 3), and church identity for this route lives in
 * the surrounding admin chrome the caller renders around ReportBody.
 */
export function VerdictHeader({ verdict, confidence }: { verdict: string; confidence: number }) {
  const band = confidenceBand(confidence)
  return (
    <div className="flex flex-col gap-2">
      <p className="font-body text-sm text-ink-soft">{`Confidence: ${band.label}`}</p>
      <p className="font-body text-lg text-ink">{verdict}</p>
      {band.low && (
        <p className="font-body text-sm text-ink-soft">
          Based on limited responses — add respondents to sharpen this.
        </p>
      )}
    </div>
  )
}

/** 8 rows, same fixed chain-then-enabler order as the dossiers (spec §7 Layer 1). */
export function AreaTable({ areas }: { areas: AreaDossierView[] }) {
  return (
    <table className="w-full border-collapse font-body text-sm">
      <thead>
        <tr className="border-b border-line text-left text-ink-soft">
          <th className="py-1.5 font-normal">Area</th>
          <th className="py-1.5 font-normal">Score</th>
          <th className="py-1.5 font-normal">N</th>
          <th className="py-1.5 font-normal">Band</th>
        </tr>
      </thead>
      <tbody>
        {areas.map((area) => (
          <tr key={area.category_id} className="border-b border-line">
            <td className="py-1.5 text-ink">{area.name}</td>
            <td className="py-1.5 text-ink">{area.score}</td>
            <td className="py-1.5 text-ink">{area.n}</td>
            <td className="py-1.5 text-ink">{area.readingLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
