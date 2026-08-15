import { BAND_FILL, BAND_TEXT, THEME_FILL, type ChartModel } from '@/lib/report/charts'

/**
 * The web half of the chart seam. Consumes the SAME ChartModel the PDF renderer does
 * (lib/report/pdf/charts.tsx) and NEVER recomputes geometry — the rank list and verdict block
 * draw the model's x/y/w/h as SVG; the stat grid lays the same cells out as an HTML grid so it
 * can reflow on narrow screens.
 *
 * Charts render on the public share page too: assembleFallbackOnly attaches the same models, and
 * chartsForSection never reads section.source. The share page is permanently fallback-only, so
 * the charts are the one part of it that is not a degraded view of the real report.
 */

const INK = '#1A1A18'
const INK_SOFT = '#5A5A54'
const RULE = '#D8D5CE'
const CREAM = '#FAF7F0'

/**
 * The 8-area stat grid as a real HTML grid (Part B spec §4.2.5): 2 columns below sm, 4 from sm
 * up. Still the same model object as the PDF — score, band, caps 'NAME · BAND' label and the
 * mini-bar all come off `model.cells`; the bar length is the model's own bar.w as a share of
 * the cell's inner width (bar.x - x is the cell padding), a unit conversion, not new geometry.
 * The other two kinds stay SVG below.
 */
function WebStatGrid({ model }: { model: Extract<ChartModel, { kind: 'stat_grid' }> }) {
  return (
    <ul className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4" aria-label="Area scores with health bands">
      {model.cells.map((cell) => {
        const inner = cell.w - 2 * (cell.bar.x - cell.x)
        return (
          <li key={cell.id} className="flex flex-col border-b border-r border-line p-3">
            <p className="font-display text-2xl font-semibold leading-none" style={{ color: BAND_TEXT[cell.band] }}>
              {cell.score}
            </p>
            <p className="mt-1 font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
              {cell.label}
            </p>
            <div className="mt-3 h-1" style={{ width: `${(cell.bar.w / inner) * 100}%`, backgroundColor: BAND_FILL[cell.band] }} />
          </li>
        )
      })}
    </ul>
  )
}

function WebRankList({ model }: { model: Extract<ChartModel, { kind: 'rank_list' }> }) {
  return (
    <svg viewBox={`0 0 ${model.width} ${model.height}`} className="w-full h-auto" role="img" aria-label="Six weakest questions">
      {model.rows.map((row, i) => (
        <g key={row.itemId}>
          {i > 0 ? (
            <line x1={0} y1={row.y - 5} x2={model.width} y2={row.y - 5} stroke={RULE} strokeWidth={0.75} />
          ) : null}
          <text x={0} y={row.y + 30} fill={BAND_FILL.broken} fontSize={24} fontWeight={600} fontFamily="Fraunces, serif">
            {row.rank}
          </text>
          <text x={44} y={row.y + 18} fill={INK} fontSize={7.5} fontWeight={700}>
            {row.text.toUpperCase()}
          </text>
          <text x={44} y={row.y + 30} fill={THEME_FILL[row.theme]} fontSize={7.5} fontWeight={700}>
            {row.themeLabel}
          </text>
          <rect x={row.scoreBlock.x} y={row.scoreBlock.y} width={row.scoreBlock.w} height={row.scoreBlock.h} fill={BAND_FILL.severe} />
          <text x={row.scoreBlock.x + 14} y={row.scoreBlock.y + 22} fill={CREAM} fontSize={16} fontWeight={600} fontFamily="Fraunces, serif">
            {row.mean}
          </text>
        </g>
      ))}
    </svg>
  )
}

function WebVerdictBlock({ model }: { model: Extract<ChartModel, { kind: 'verdict_block' }> }) {
  return (
    <svg viewBox={`0 0 ${model.width} ${model.height}`} className="w-full h-auto" role="img" aria-label="Overall health verdict">
      <rect x={model.hero.x} y={model.hero.y} width={model.hero.w} height={model.hero.h} fill="none" stroke={RULE} strokeWidth={0.75} />
      <text x={24} y={100} fill={BAND_TEXT[model.hero.band]} fontSize={84} fontWeight={600} fontFamily="Fraunces, serif">
        {model.hero.score}
      </text>
      <text x={24} y={124} fill={INK_SOFT} fontSize={7.5} fontWeight={700}>
        {`${model.hero.tierName} · Overall Health`.toUpperCase()}
      </text>
      {model.stats.map((stat) => (
        <g key={stat.label}>
          <rect x={stat.x} y={stat.y} width={stat.w} height={stat.h} fill="none" stroke={RULE} strokeWidth={0.75} />
          <text x={stat.x + 12} y={stat.y + 34} fill={INK} fontSize={24} fontWeight={600} fontFamily="Fraunces, serif">
            {stat.value}
          </text>
          <text x={stat.x + 12} y={stat.y + 48} fill={INK_SOFT} fontSize={7.5} fontWeight={700}>
            {stat.label.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function WebChart({ model }: { model: ChartModel }) {
  switch (model.kind) {
    case 'stat_grid':
      return <WebStatGrid model={model} />
    case 'rank_list':
      return <WebRankList model={model} />
    case 'verdict_block':
      return <WebVerdictBlock model={model} />
    default: {
      const _exhaustive: never = model
      return _exhaustive
    }
  }
}
