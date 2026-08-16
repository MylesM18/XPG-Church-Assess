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

const CREAM = '#FAF7F0'

/**
 * The 8-area stat grid as a real HTML grid (Part B spec §4.2.5): 2 columns below sm, 4 from sm
 * up. Still the same model object as the PDF — score, band, caps 'NAME · BAND' label and the
 * mini-bar all come off `model.cells`; the bar length is the model's own bar.w as a share of
 * the cell's inner width (bar.x - x is the cell padding), a unit conversion, not new geometry.
 * The other two kinds stay SVG below.
 *
 * `role="list"` is not redundant: Safari/VoiceOver drops a <ul>'s implicit list role once it
 * carries `display:grid`, so without it the eight cells stop being announced as a list. Keep it
 * for as long as this is a grid.
 */
function WebStatGrid({ model }: { model: Extract<ChartModel, { kind: 'stat_grid' }> }) {
  return (
    <ul
      role="list"
      className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4"
      aria-label="Area scores with health bands"
    >
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
            {cell.percentile === null ? null : (
              <p className="mt-1 font-body text-[0.625rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
                {`${cell.percentile}TH PCTL`}
              </p>
            )}
            <div className="mt-3 h-1" style={{ width: `${(cell.bar.w / inner) * 100}%`, backgroundColor: BAND_FILL[cell.band] }} />
          </li>
        )
      })}
    </ul>
  )
}

// Rebuilt in HTML (spec §6.5). The SVG version had to truncate at RANK_TEXT_MAX=90 and set the
// question at fontSize 7.5 to fit a fixed 400-unit text slot; wrapping HTML has neither limit, so
// this reads `row.fullText` in sentence case at a real body size. lib/report/charts.ts keeps
// producing `row.text` for the PDF, which still has the fixed slot.
function WebRankList({ model }: { model: Extract<ChartModel, { kind: 'rank_list' }> }) {
  return (
    <ol role="list" className="flex flex-col" aria-label="Weakest questions, ranked">
      {model.rows.map((row, i) => (
        <li
          key={row.itemId}
          className={`grid grid-cols-[2.25rem_1fr_auto] items-start gap-3 py-3${
            i > 0 ? ' border-t border-line' : ''
          }`}
        >
          <span className="font-display text-[1.75rem] font-semibold leading-none text-ink-soft">
            {row.rank}
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-body text-[0.8125rem] leading-[1.5] text-ink">{row.fullText}</p>
            <p
              className="font-body text-[0.625rem] font-bold uppercase tracking-[0.1em]"
              style={{ color: THEME_FILL[row.theme] }}
            >
              {row.themeLabel}
            </p>
          </div>
          <span
            className="flex min-w-[3.5rem] items-center justify-center px-2 py-1"
            style={{ backgroundColor: BAND_FILL.severe }}
          >
            <span
              className="font-display text-[1.125rem] font-semibold leading-none"
              style={{ color: CREAM }}
            >
              {row.mean}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Hero verdict + a 2x2 context dashboard, as HTML (spec §6.3). Was an SVG whose
 * only job was to draw four hairline rects and place text inside them — a grid
 * with borders does that natively, and the hero numeral can then scale with the
 * viewport instead of being locked to a 500-unit viewBox.
 *
 * Reads the model for VALUES ONLY. hero.x/y/w/h and stat.x/y/w/h are PDF
 * geometry and are deliberately unread here.
 */
function WebVerdictBlock({ model }: { model: Extract<ChartModel, { kind: 'verdict_block' }> }) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border border-line p-5">
        <p
          className="font-display font-semibold leading-none"
          style={{ fontSize: 'clamp(3.5rem, 12vw, 5.25rem)', color: BAND_TEXT[model.hero.band] }}
        >
          {model.hero.score}
        </p>
        <p className="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
          {`${model.hero.tierName} · Overall Health`.toUpperCase()}
        </p>
      </div>
      <ul
        role="list"
        className="grid grid-cols-2 border-l border-t border-line"
        aria-label="Context statistics"
      >
        {model.stats.map((stat) => (
          <li key={stat.label} className="flex flex-col border-b border-r border-line p-3">
            <p className="font-display text-2xl font-semibold leading-none text-ink">{stat.value}</p>
            <p className="mt-1 font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
              {stat.label.toUpperCase()}
            </p>
          </li>
        ))}
      </ul>
    </div>
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
