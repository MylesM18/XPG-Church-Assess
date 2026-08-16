/**
 * Web-only report visuals (spec §6). Presentational only — these components read
 * models from lib/report/web-visuals.ts for VALUES and never compute anything.
 *
 * role="list" is set explicitly on every list-shaped visual: Safari/VoiceOver
 * drops the implicit list role under display:grid (see charts.tsx:25-29).
 * Tracks and bars are aria-hidden; every value is also real text.
 */
import { BAND_FILL, BAND_TEXT } from '@/lib/report/charts';
import type { ConfidenceModel } from '@/lib/report/web-visuals';

const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

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
