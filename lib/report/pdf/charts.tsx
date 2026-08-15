import { Svg, G, Rect, Line, Text as SvgText } from '@react-pdf/renderer';
import { BAND_FILL, BAND_TEXT, THEME_FILL, type ChartModel } from '../charts';
import { FONT_BODY, FONT_DISPLAY } from './fonts';

/**
 * The PDF half of the chart seam. Consumes a ChartModel computed in lib/report/charts.ts and
 * NEVER recomputes geometry — every x/y/w/h here comes off the model. Its web twin
 * (app/app/[churchId]/diagnosis/report/charts.tsx) draws the identical numbers with DOM <svg>,
 * which is what makes parity structural rather than a thing two files remember to do.
 */

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const CREAM = '#FAF7F0';

function PdfStatGrid({ model }: { model: Extract<ChartModel, { kind: 'stat_grid' }> }) {
  return (
    <Svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
      {model.cells.map((cell) => (
        <G key={cell.id}>
          <Rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill="none" stroke={RULE} strokeWidth={0.75} />
          <SvgText
            x={cell.x + 12}
            y={cell.y + 34}
            fill={BAND_TEXT[cell.band]}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24 }}
          >
            {String(cell.score)}
          </SvgText>
          <SvgText
            x={cell.x + 12}
            y={cell.y + 48}
            fill={INK_SOFT}
            style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}
          >
            {cell.label}
          </SvgText>
          <Rect x={cell.bar.x} y={cell.bar.y} width={cell.bar.w} height={cell.bar.h} fill={BAND_FILL[cell.band]} />
        </G>
      ))}
    </Svg>
  );
}

function PdfRankList({ model }: { model: Extract<ChartModel, { kind: 'rank_list' }> }) {
  return (
    <Svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
      {model.rows.map((row, i) => (
        <G key={row.itemId}>
          {i > 0 ? (
            <Line x1={0} y1={row.y - 5} x2={model.width} y2={row.y - 5} stroke={RULE} strokeWidth={0.75} />
          ) : null}
          <SvgText
            x={0}
            y={row.y + 30}
            fill={BAND_FILL.broken}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24 }}
          >
            {row.rank}
          </SvgText>
          <SvgText
            x={44}
            y={row.y + 18}
            fill={INK}
            style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}
          >
            {row.text.toUpperCase()}
          </SvgText>
          <SvgText
            x={44}
            y={row.y + 30}
            fill={THEME_FILL[row.theme]}
            style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}
          >
            {row.themeLabel}
          </SvgText>
          <Rect
            x={row.scoreBlock.x}
            y={row.scoreBlock.y}
            width={row.scoreBlock.w}
            height={row.scoreBlock.h}
            fill={BAND_FILL.severe}
          />
          <SvgText
            x={row.scoreBlock.x + 14}
            y={row.scoreBlock.y + 22}
            fill={CREAM}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16 }}
          >
            {String(row.mean)}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

function PdfVerdictBlock({ model }: { model: Extract<ChartModel, { kind: 'verdict_block' }> }) {
  return (
    <Svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
      <Rect x={model.hero.x} y={model.hero.y} width={model.hero.w} height={model.hero.h} fill="none" stroke={RULE} strokeWidth={0.75} />
      <SvgText
        x={24}
        y={100}
        fill={BAND_TEXT[model.hero.band]}
        style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 84 }}
      >
        {String(model.hero.score)}
      </SvgText>
      <SvgText
        x={24}
        y={124}
        fill={INK_SOFT}
        style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}
      >
        {`${model.hero.tierName} · Overall Health`.toUpperCase()}
      </SvgText>
      {model.stats.map((stat) => (
        <G key={stat.label}>
          <Rect x={stat.x} y={stat.y} width={stat.w} height={stat.h} fill="none" stroke={RULE} strokeWidth={0.75} />
          <SvgText
            x={stat.x + 12}
            y={stat.y + 34}
            fill={INK}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24 }}
          >
            {String(stat.value)}
          </SvgText>
          <SvgText
            x={stat.x + 12}
            y={stat.y + 48}
            fill={INK_SOFT}
            style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}
          >
            {stat.label.toUpperCase()}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

export function PdfChart({ model }: { model: ChartModel }) {
  switch (model.kind) {
    case 'stat_grid':
      return <PdfStatGrid model={model} />;
    case 'rank_list':
      return <PdfRankList model={model} />;
    case 'verdict_block':
      return <PdfVerdictBlock model={model} />;
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}
