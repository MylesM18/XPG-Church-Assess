import { Svg, G, Rect, Line, Text as SvgText, Polygon } from '@react-pdf/renderer';
import { BAND_FILL, THEME_FILL, type ChartModel } from '../charts';

/**
 * The PDF half of the chart seam. Consumes a ChartModel computed in lib/report/charts.ts and
 * NEVER recomputes geometry — every x/y/w/h here comes off the model. Its web twin
 * (app/app/[churchId]/diagnosis/report/charts.tsx) draws the identical numbers with DOM <svg>,
 * which is what makes parity structural rather than a thing two files remember to do.
 */

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const LABEL_SIZE = 7;
const TICK_SIZE = 6;

function AreaBars({ model }: { model: Extract<ChartModel, { kind: 'area_bars' }> }) {
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 12}`} style={{ width: '100%', height: model.h + 12 }}>
      <G>
        {model.ticks.map((tick) => (
          <Line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
        ))}
        {model.bars.map((bar) => (
          <G key={bar.id}>
            <SvgText x={0} y={bar.y + bar.h - 3} fill={INK} style={{ fontSize: LABEL_SIZE }}>{bar.name}</SvgText>
            <Rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={BAND_FILL[bar.band]} />
            <SvgText x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} style={{ fontSize: LABEL_SIZE }}>
              {String(bar.score)}
            </SvgText>
          </G>
        ))}
        {model.ticks.map((tick) => (
          <SvgText key={tick.value} x={tick.x} y={model.h + 9} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>
            {String(tick.value)}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

function TierGauge({ model }: { model: Extract<ChartModel, { kind: 'tier_gauge' }> }) {
  const markerY = model.h;
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 16}`} style={{ width: '100%', height: model.h + 16 }}>
      <G>
        {model.bands.map((band, i) => (
          <G key={band.id}>
            <Rect x={band.x} y={0} width={band.w} height={model.h} fill={i % 2 === 0 ? '#EFEDE7' : '#E3E0D8'} />
            <SvgText x={band.x + 2} y={model.h - 6} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>{band.name}</SvgText>
          </G>
        ))}
        <Polygon
          points={`${model.marker.x - 4},${markerY + 8} ${model.marker.x + 4},${markerY + 8} ${model.marker.x},${markerY}`}
          fill={INK}
        />
        <SvgText x={Math.min(model.marker.x + 6, model.w - 40)} y={markerY + 14} fill={INK} style={{ fontSize: LABEL_SIZE }}>
          {`${model.marker.value} · ${model.marker.label}`}
        </SvgText>
      </G>
    </Svg>
  );
}

function BottomItems({ model }: { model: Extract<ChartModel, { kind: 'bottom_items' }> }) {
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 12}`} style={{ width: '100%', height: model.h + 12 }}>
      <G>
        {model.ticks.map((tick) => (
          <Line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
        ))}
        {model.bars.map((bar) => (
          <G key={bar.id}>
            <SvgText x={0} y={bar.y + bar.h - 3} fill={INK} style={{ fontSize: TICK_SIZE }}>{bar.id}</SvgText>
            <Rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={THEME_FILL[bar.theme]} />
            <SvgText x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>
              {`${bar.mean} · ${bar.theme}`}
            </SvgText>
          </G>
        ))}
      </G>
    </Svg>
  );
}

export function PdfChart({ model }: { model: ChartModel }) {
  switch (model.kind) {
    case 'area_bars':
      return <AreaBars model={model} />;
    case 'tier_gauge':
      return <TierGauge model={model} />;
    case 'bottom_items':
      return <BottomItems model={model} />;
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}
