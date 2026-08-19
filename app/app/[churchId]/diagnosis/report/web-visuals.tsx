/**
 * Web-only report visuals (spec §6). Presentational only — these components read
 * models from lib/report/web-visuals.ts for VALUES and never compute anything.
 *
 * role="list" is set explicitly on every list-shaped visual: Safari/VoiceOver
 * drops the implicit list role under display:grid (see charts.tsx:25-29).
 * Tracks and bars are aria-hidden; every value is also real text.
 *
 * CHROME COMES FROM THE WEB @theme, NOT THE PDF. Band colours (BAND_FILL /
 * BAND_TEXT / THEME_FILL) are the shared seam and stay byte-identical across the two
 * surfaces — everything else (ink, ink-soft, hairlines, the page ground) is the web's
 * own token, as Tailwind utilities where the value is static and `var(--color-…)`
 * where it sits alongside a computed one. These are HTML components, not SVG
 * transcriptions of the PDF drawing, so a PDF hex here renders a warm grey beside the
 * theme's cool one on the same screen.
 */
import { BAND_FILL, BAND_TEXT, THEME_FILL, textOnBand } from '@/lib/report/charts';
import type {
  CapacityBarsModel,
  ChainModel,
  ConstraintCalloutModel,
  DumbbellsModel,
  PhaseRailModel,
  SpreadModel,
  ThemeSplitModel,
} from '@/lib/report/web-visuals';

/** Byte-identical to the LIST const in sections.tsx:17. Duplicated rather than
 * exported because that one is module-private chrome, not a shared token. */
const LIST = 'list-disc space-y-1 pl-5 font-body text-base leading-[1.6] text-ink';

const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]';
/** CAPS in the theme's secondary ink — the same pairing sections.tsx uses for the
 * opener eyebrow and the s6 beat labels. Bare CAPS is for labels that inherit their
 * colour from a band ground instead. */
const CAPS_SOFT = `${CAPS} text-ink-soft`;
const NUM = 'font-display font-semibold leading-none';
/** Sentence-case chip. Deliberately NOT built on CAPS: the gap chip carries a sentence
 * ("3 points lost to your weakest area."), and CAPS's text-transform would shout it back
 * into the eyebrow it used to be. Sized a step up from CAPS's 0.6875rem so that losing the
 * caps does not also lose the apparent size. */
const CHIP = 'font-body text-[0.8125rem] font-semibold leading-snug';
/** The gloss under a bar: a sentence in the secondary ink, never eyebrow chrome. */
const GLOSS = 'font-body text-[0.8125rem] leading-[1.5] text-ink-soft';

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
    {
      key: 'capacity',
      label: model.capacityLabel,
      explanation: model.capacityExplanation,
      value: model.capacity,
      pct: model.capacityPct,
      opacity: 1,
    },
    {
      key: 'throughput',
      label: model.throughputLabel,
      explanation: model.throughputExplanation,
      value: model.throughput,
      pct: model.throughputPct,
      opacity: 0.45,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ul role="list" className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li key={bar.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={CAPS_SOFT}>{bar.label}</span>
              <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[model.band] }}>
                {bar.value}
              </span>
            </div>
            <div aria-hidden className="h-2 w-full overflow-hidden bg-line">
              <div
                className="h-full"
                style={{
                  width: `${bar.pct}%`,
                  backgroundColor: BAND_FILL[model.band],
                  opacity: bar.opacity,
                }}
              />
            </div>
            <p className={GLOSS}>{bar.explanation}</p>
          </li>
        ))}
      </ul>
      {model.gapLabel === null ? null : (
        <p
          className={`self-start px-2 py-1 ${CHIP}`}
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
 *
 * The hollow dot's fill is the PAGE GROUND (--color-paper, what html/body carry in
 * globals.css), not a light grey that happens to look close: any other value shows up
 * as a visible disc instead of a hole punched in the segment.
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
              <span className={CAPS_SOFT}>{row.name}</span>
              <span className="flex items-baseline gap-2">
                <span className={CAPS_SOFT}>Gap</span>
                <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[row.band] }}>
                  {row.gap}
                </span>
              </span>
            </div>
            <div aria-hidden className="relative h-3 w-full">
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
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
                  backgroundColor: 'var(--color-paper)',
                  borderColor: BAND_FILL[row.band],
                }}
              />
            </div>
            <p className="font-body text-[0.6875rem] tracking-[0.04em] text-ink-soft">
              {`Evidence ${row.evidence} · Belief ${row.belief}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Which of the four themes the weakest indicators cluster in (spec §6.5).
 *
 * All four rows always render, including zero-count ones: "theology never
 * appeared" is a finding, and dropping the row would hide it. A zero row keeps
 * its label and an empty track, with the 0 in ink-soft rather than theme colour.
 *
 * No closing summary sentence — the label above is the whole frame.
 */
export function WebThemeSplit({ model }: { model: ThemeSplitModel }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={CAPS_SOFT}>{model.label}</p>
      <ul role="list" className="flex flex-col gap-2">
        {model.rows.map((row) => (
          <li key={row.theme} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3">
            <span className={CAPS} style={{ color: THEME_FILL[row.theme] }}>
              {row.label}
            </span>
            <span aria-hidden className="block h-2 w-full bg-line">
              <span
                className="block h-full"
                style={{ width: `${row.pct}%`, backgroundColor: THEME_FILL[row.theme] }}
              />
            </span>
            <span
              className={`${NUM} text-right text-[1.125rem]`}
              style={{
                color: row.count === 0 ? 'var(--color-ink-soft)' : THEME_FILL[row.theme],
              }}
            >
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How far apart respondents were, per flagged area (spec §6.6).
 *
 * facts.dispersion is FLAGGED-ONLY, so every bar here has already cleared the
 * threshold. The dashed marker is therefore a floor every bar crosses, and it is
 * labelled with the bare number — never "above", "below", or pass/fail language.
 *
 * The list key includes the index: two rows can legitimately share a category_id.
 */
export function WebSpread({ model }: { model: SpreadModel }) {
  return (
    <div className="flex flex-col gap-3">
      <ul role="list" className="flex flex-col gap-2">
        {model.rows.map((row, i) => (
          <li
            key={`${row.id}-${i}`}
            className="grid items-center gap-1 sm:grid-cols-[9rem_1fr_2.5rem] sm:gap-3"
          >
            <span className={CAPS_SOFT}>{row.name}</span>
            <span aria-hidden className="relative block h-2 w-full bg-line">
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: `${row.pct}%`, backgroundColor: BAND_FILL[row.band] }}
              />
              <span
                className="absolute -inset-y-1 border-l border-dashed"
                style={{ left: `${model.thresholdPct}%`, borderColor: 'var(--color-ink-soft)' }}
              />
            </span>
            <span
              className={`${NUM} text-[1.125rem] sm:text-right`}
              style={{ color: BAND_TEXT[row.band] }}
            >
              {row.spread}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3">
        <span className={CAPS_SOFT}>{model.thresholdLabel}</span>
        <span className={CAPS_SOFT}>{model.axisMaxLabel}</span>
      </div>
    </div>
  );
}

/**
 * The five-stage dependency chain as a VERTICAL rail (spec §6.5). Vertical
 * because gate chips have to sit beside the stage they gate, and a horizontal
 * rail has nowhere to put them on a phone.
 *
 * Stage order is rules.chain, resolved in the model — never score order.
 * Each gate chip carries its own band, which can differ from its stage's.
 *
 * Never guards on an empty stage list: nullability belongs to the dispatcher
 * (sections.tsx), which is where every sibling visual's null check already lives.
 */
export function WebChainRail({ model }: { model: ChainModel }) {
  return (
    <div className="flex flex-col gap-5">
      <ol role="list" className="relative flex flex-col gap-5">
        <span aria-hidden className="absolute bottom-3 left-3 top-3 w-px bg-line" />
        {model.stages.map((stage) => (
          <li key={stage.id} className="relative flex flex-col gap-2 pl-10">
            <span
              className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center font-body text-[0.625rem] font-bold tracking-[0.04em]"
              style={{ backgroundColor: BAND_FILL[stage.band], color: textOnBand(stage.band) }}
            >
              {stage.ordinal}
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-[1.0625rem] font-semibold text-ink">{stage.name}</p>
              <p className={`${NUM} text-[1.25rem]`} style={{ color: BAND_TEXT[stage.band] }}>
                {stage.score}
              </p>
            </div>
            {stage.gates.length === 0 ? null : (
              <ul role="list" className="flex flex-col gap-2">
                {stage.gates.map((gate) => (
                  <li
                    key={gate.id}
                    className="flex flex-col gap-0.5 border-l-2 pl-2"
                    style={{ borderColor: BAND_FILL[gate.band] }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={CAPS} style={{ color: BAND_TEXT[gate.band] }}>
                        {gate.name}
                      </span>
                      <span
                        className="font-body text-[0.6875rem] font-bold"
                        style={{ color: BAND_TEXT[gate.band] }}
                      >
                        {gate.score}
                      </span>
                    </span>
                    <span className="font-body text-[0.8125rem] leading-[1.5] text-ink">
                      {gate.note}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The 30/60/90 roadmap as colour-keyed blocks (spec §6.6). This is the one visual
 * that REPLACES a section body rather than sitting beside it, so it also owns the
 * bullets it does not supersede.
 *
 * NOT always three blocks: the foundation archetype emits one block per (phase,
 * gated enabler) pair, so three gated enablers render nine. The model keys opacity
 * off the PHASE, so however many blocks there are, every 30-day block is full
 * strength, every 60-day block is 0.6 and every 90-day block is 0.3.
 *
 * The list key includes the index for that same reason: with nine blocks drawn from
 * three phases, `key={block.dayLabel}` would give nine siblings only three distinct
 * keys — the identical hazard WebSpread's `${row.id}-${i}` key exists to avoid.
 *
 * s10Bullets renders the phase entries AND may append a `Do not work on yet: ...`
 * bullet that roadmapEntries() never produced. The model's `supersedes` holds the
 * exact strings this rail stands in for; anything left over is real deterministic
 * prose and is rendered beneath as an ordinary bullet list. No parsing, no new
 * prose, nothing silently dropped.
 *
 * Text colour flips to the theme's ink below full opacity: textOnBand is computed for
 * the band at full strength, and cream on a 30%-strength ground is unreadable.
 * Phase-keyed opacity therefore means the 30-day blocks — and only those — wear
 * textOnBand.
 */
export function WebPhaseRail({ model, bullets }: { model: PhaseRailModel; bullets: string[] }) {
  const remaining = bullets.filter((bullet) => !model.supersedes.includes(bullet));
  return (
    <div className="flex flex-col gap-4">
      <ol role="list" className="flex flex-col gap-px">
        {model.blocks.map((block, i) => (
          <li key={`${block.dayLabel}-${i}`} className="relative px-5 py-4">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ backgroundColor: BAND_FILL[model.band], opacity: block.opacity }}
            />
            <div
              className="relative flex flex-col gap-1"
              style={{
                color: block.opacity === 1 ? textOnBand(model.band) : 'var(--color-ink)',
              }}
            >
              <div className="flex items-baseline gap-3">
                <span className={`${NUM} text-[1.75rem]`}>{block.numeral}</span>
                <span className={CAPS}>{block.unit}</span>
              </div>
              <p className="font-body text-[0.9375rem] leading-[1.6]">{block.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {remaining.length === 0 ? null : (
        <ul className={LIST}>
          {remaining.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
