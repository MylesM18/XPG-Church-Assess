/**
 * Web-only report visuals (spec §6). Presentational only — these components read
 * models from lib/report/web-visuals.ts for VALUES and never compute anything.
 *
 * role="list" is set explicitly on every list-shaped visual: Safari/VoiceOver
 * drops the implicit list role under display:grid (see charts.tsx:25-29).
 * Tracks and bars are aria-hidden; every value is also real text.
 */
import { BAND_FILL, BAND_TEXT, textOnBand } from '@/lib/report/charts';
import type {
  CapacityBarsModel,
  ConfidenceModel,
  ConstraintCalloutModel,
  DumbbellsModel,
} from '@/lib/report/web-visuals';

const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const CREAM = '#FAF7F0';

const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]';
const NUM = 'font-display font-semibold leading-none';

export function WebConfidence({ model }: { model: ConfidenceModel }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={CAPS} style={{ color: INK_SOFT }}>
          Confidence
        </p>
        <p className={`${NUM} text-[1.5rem]`} style={{ color: BAND_TEXT.holding }}>
          {model.label}
        </p>
      </div>
      <div
        aria-hidden
        className="h-2 w-full overflow-hidden"
        style={{ backgroundColor: RULE }}
      >
        <div
          className="h-full"
          style={{ width: `${model.pct}%`, backgroundColor: BAND_FILL.holding }}
        />
      </div>
      <ul role="list" className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: RULE }}>
        <li className="flex items-baseline justify-between gap-3">
          <span className={CAPS} style={{ color: INK_SOFT }}>
            Respondents
          </span>
          <span className="font-body text-[0.8125rem] text-ink">{model.respondents}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className={CAPS} style={{ color: INK_SOFT }}>
            Areas assessed
          </span>
          <span className="font-body text-[0.8125rem] text-ink">{model.areas}</span>
        </li>
        {model.thinnest ? (
          <li className="flex items-baseline justify-between gap-3">
            <span className={CAPS} style={{ color: INK_SOFT }}>
              Thinnest coverage
            </span>
            <span className="font-body text-[0.8125rem] text-ink">
              {model.thinnest.name} · {model.thinnest.count}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Capacity vs throughput on one shared 0-100 axis (spec §6.3) — the two bars are
 * only comparable if they share a scale, which is why the model hands over
 * pre-clamped percentages rather than raw scores.
 *
 * Throughput is the SAME hex at reduced opacity, never a second colour: it is
 * the same quantity degraded, not a different category.
 */
export function WebCapacityBars({ model }: { model: CapacityBarsModel }) {
  const bars = [
    { key: 'capacity', label: 'Capacity', value: model.capacity, pct: model.capacityPct, opacity: 1 },
    { key: 'throughput', label: 'Throughput', value: model.throughput, pct: model.throughputPct, opacity: 0.45 },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ul role="list" className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li key={bar.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={CAPS} style={{ color: INK_SOFT }}>
                {bar.label}
              </span>
              <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[model.band] }}>
                {bar.value}
              </span>
            </div>
            <div aria-hidden className="h-2 w-full overflow-hidden" style={{ backgroundColor: RULE }}>
              <div
                className="h-full"
                style={{
                  width: `${bar.pct}%`,
                  backgroundColor: BAND_FILL[model.band],
                  opacity: bar.opacity,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {model.gapLabel === null ? null : (
        <p
          className={`self-start px-2 py-1 ${CAPS}`}
          style={{ backgroundColor: BAND_FILL[model.band], color: textOnBand(model.band) }}
        >
          {model.gapLabel}
        </p>
      )}
    </div>
  );
}

/**
 * Full-bleed banded panel naming the one thing holding the church back
 * (spec §6.4). Full-bleed on narrow via the same -mx-6 px-6 sm:mx-0 pattern the
 * section opener uses, so it reads as a slab rather than a boxed aside.
 *
 * The panel ground is the model's band, which on the gating face follows the
 * WORST gated enabler — the panel never looks healthier than its worst row.
 */
export function WebConstraintCallout({ model }: { model: ConstraintCalloutModel }) {
  return (
    <div
      className="-mx-6 flex flex-col gap-3 px-6 py-5 sm:mx-0 sm:px-5"
      style={{ backgroundColor: BAND_FILL[model.band], color: textOnBand(model.band) }}
    >
      <p className={CAPS}>{model.eyebrow}</p>
      <ul role="list" className="flex flex-col gap-3">
        {model.rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[1.125rem] font-semibold leading-tight">
                {row.name}
              </span>
              <span className={`${NUM} text-[1.5rem]`}>{row.score}</span>
            </div>
            {row.note === null ? null : (
              <p className="font-body text-[0.8125rem] leading-[1.5]">{row.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Belief vs evidence per area (spec §6.4). Solid dot = evidence (what the data
 * says), hollow dot = belief (what the room says), the segment between them is
 * the gap. Both numbers are printed as real text beneath — the dot positions are
 * an illustration of the gap, never the only place the values live.
 */
export function WebDumbbells({ model }: { model: DumbbellsModel }) {
  return (
    <ul role="list" className="flex flex-col gap-4">
      {model.rows.map((row) => {
        const left = Math.min(row.evidencePct, row.beliefPct);
        const right = Math.max(row.evidencePct, row.beliefPct);
        return (
          <li key={row.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={CAPS} style={{ color: INK_SOFT }}>
                {row.name}
              </span>
              <span className="flex items-baseline gap-2">
                <span className={CAPS} style={{ color: INK_SOFT }}>
                  Gap
                </span>
                <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[row.band] }}>
                  {row.gap}
                </span>
              </span>
            </div>
            <div aria-hidden className="relative h-3 w-full">
              <span
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ backgroundColor: RULE }}
              />
              <span
                className="absolute top-1/2 h-[3px] -translate-y-1/2"
                style={{
                  left: `${left}%`,
                  width: `${right - left}%`,
                  backgroundColor: BAND_FILL[row.band],
                }}
              />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${row.evidencePct}%`, backgroundColor: BAND_FILL[row.band] }}
              />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  left: `${row.beliefPct}%`,
                  backgroundColor: CREAM,
                  borderColor: BAND_FILL[row.band],
                }}
              />
            </div>
            <p className="font-body text-[0.6875rem] tracking-[0.04em]" style={{ color: INK_SOFT }}>
              {`Evidence ${row.evidence} · Belief ${row.belief}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
