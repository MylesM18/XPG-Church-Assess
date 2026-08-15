import { BAND_FILL, BAND_TEXT, THEME_FILL, type ChartModel } from '@/lib/report/charts'

/**
 * The web half of the chart seam. Consumes the SAME ChartModel the PDF renderer does
 * (lib/report/pdf/charts.tsx) and NEVER recomputes geometry — every x/y/w/h comes off the model.
 * Different primitives, identical numbers.
 *
 * Charts render on the public share page too: assembleFallbackOnly attaches the same models, and
 * chartsForSection never reads section.source. The share page is permanently fallback-only, so
 * the charts are the one part of it that is not a degraded view of the real report.
 */

const INK = '#1A1A18'
const INK_SOFT = '#5A5A54'
const RULE = '#D8D5CE'
const CREAM = '#FAF7F0'

function AreaBars({ model }: { model: Extract<ChartModel, { kind: 'area_bars' }> }) {
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 12}`} className="w-full h-auto" role="img"
         aria-label="Area scores out of 100, highest first">
      {model.ticks.map((tick) => (
        <line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
      ))}
      {model.bars.map((bar) => (
        <g key={bar.id}>
          <text x={0} y={bar.y + bar.h - 3} fill={INK} fontSize={7}>{bar.name}</text>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={BAND_FILL[bar.band]} />
          <text x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} fontSize={7}>{bar.score}</text>
        </g>
      ))}
      {model.ticks.map((tick) => (
        <text key={tick.value} x={tick.x} y={model.h + 9} fill={INK_SOFT} fontSize={6}>{tick.value}</text>
      ))}
    </svg>
  )
}

function TierGauge({ model }: { model: Extract<ChartModel, { kind: 'tier_gauge' }> }) {
  const markerY = model.h
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 16}`} className="w-full h-auto" role="img"
         aria-label={`Overall ${model.marker.value} out of 100 — ${model.marker.label}`}>
      {model.bands.map((band, i) => (
        <g key={band.id}>
          <rect x={band.x} y={0} width={band.w} height={model.h} fill={i % 2 === 0 ? '#EFEDE7' : '#E3E0D8'} />
          <text x={band.x + 2} y={model.h - 6} fill={INK_SOFT} fontSize={6}>{band.name}</text>
        </g>
      ))}
      <polygon
        points={`${model.marker.x - 4},${markerY + 8} ${model.marker.x + 4},${markerY + 8} ${model.marker.x},${markerY}`}
        fill={INK}
      />
      <text x={Math.min(model.marker.x + 6, model.w - 40)} y={markerY + 14} fill={INK} fontSize={7}>
        {`${model.marker.value} · ${model.marker.label}`}
      </text>
    </svg>
  )
}

function BottomItems({ model }: { model: Extract<ChartModel, { kind: 'bottom_items' }> }) {
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 12}`} className="w-full h-auto" role="img"
         aria-label="Lowest scoring indicators, coloured by theme">
      {model.ticks.map((tick) => (
        <line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
      ))}
      {model.bars.map((bar) => (
        <g key={bar.id}>
          <text x={0} y={bar.y + bar.h - 3} fill={INK} fontSize={6}>{bar.id}</text>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={THEME_FILL[bar.theme]} />
          <text x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} fontSize={6}>
            {`${bar.mean} · ${bar.theme}`}
          </text>
        </g>
      ))}
    </svg>
  )
}

function WebStatGrid({ model }: { model: Extract<ChartModel, { kind: 'stat_grid' }> }) {
  return (
    <svg viewBox={`0 0 ${model.width} ${model.height}`} className="w-full h-auto" role="img" aria-label="Area scores with health bands">
      {model.cells.map((cell) => (
        <g key={cell.id}>
          <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill="none" stroke={RULE} strokeWidth={0.75} />
          <text x={cell.x + 12} y={cell.y + 34} fill={BAND_TEXT[cell.band]} fontSize={24} fontWeight={600} fontFamily="Fraunces, serif">
            {cell.score}
          </text>
          <text x={cell.x + 12} y={cell.y + 48} fill={INK_SOFT} fontSize={7.5} fontWeight={700}>
            {cell.label}
          </text>
          <rect x={cell.bar.x} y={cell.bar.y} width={cell.bar.w} height={cell.bar.h} fill={BAND_FILL[cell.band]} />
        </g>
      ))}
    </svg>
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
    case 'area_bars':
      return <AreaBars model={model} />
    case 'tier_gauge':
      return <TierGauge model={model} />
    case 'bottom_items':
      return <BottomItems model={model} />
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
