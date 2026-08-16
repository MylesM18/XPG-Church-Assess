import type { CoverModel, CoverLadderRow } from '@/lib/report/charts'
import { BAND_FILL, BAND_TEXT, textOnBand } from '@/lib/report/charts'

// The PDF's own ink hex (lib/report/pdf/document.tsx) for the ladder's inactive-row text: the
// ladder is a transcription of the PDF's tier language, so it uses the PDF token, not the web @theme.
const INK = '#1A1A18'

const CAPS_LABEL = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft'

/**
 * Four discrete tier steps, worst -> best (spec §6.2). The web cover shows which
 * of four named tiers the church landed in; the PDF keeps rendering the
 * continuous `cover.strip` gradient from the same model.
 *
 * The active row is not distinguished by colour alone: it is solid where the
 * others are washed, it is physically larger, and it carries aria-current. The
 * caption below the ladder already names the tier in words.
 *
 * The wash is a same-hex opacity layer, not a new colour — an aria-hidden fill
 * span sits behind the label so lowering the fill's opacity never dims the text.
 */
function TierLadder({ ladder }: { ladder: CoverLadderRow[] }) {
  return (
    <ul role="list" className="flex flex-col gap-px" aria-label="Health tiers, lowest to highest">
      {ladder.map((row) => (
        <li
          key={row.tierId}
          aria-current={row.active ? 'true' : undefined}
          className={
            row.active
              ? 'relative -mx-1 flex items-center px-4 py-2.5'
              : 'relative flex items-center px-3 py-2'
          }
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: BAND_FILL[row.band], opacity: row.active ? 1 : 0.18 }}
          />
          <span
            className="relative font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]"
            style={{ color: row.active ? textOnBand(row.band) : INK }}
          >
            {row.name}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Web mirror of the PDF cover page (lib/report/pdf/document.tsx, ReportDocument's first Page):
 * monogram, church name, kicker, date, hero score, TierLadder, caption, band-filled foot with
 * the headline, runline — same order, same content, same band colours (inline styles from the
 * shared seam so they are EXACT). The church name is a <p>, NOT a heading: the report's one
 * <h1> is the first section opener in sections.tsx (tests/a11y/shared-report-heading.test.ts).
 *
 * `dateLabel` is preformatted by the caller (Month YYYY, UTC — the PDF's generatedAt format)
 * and null on a surface with no completion timestamp (the public share page).
 */
export function ReportCover({
  cover, churchName, brandColor, monogram, dateLabel,
}: {
  cover: CoverModel
  churchName: string
  brandColor: string
  monogram: string
  dateLabel: string | null
}) {
  return (
    <div className="flex flex-col">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full font-display text-base text-white"
        style={{ backgroundColor: brandColor }}
      >
        {monogram}
      </div>
      <p className="mt-4 font-display text-2xl font-semibold text-ink">{churchName}</p>
      <p className={`mt-1 ${CAPS_LABEL}`}>CHURCH HEALTH ASSESSMENT</p>
      {dateLabel !== null && <p className="mt-0.5 font-body text-base text-ink-soft">{dateLabel}</p>}

      <div className="mt-12 flex flex-col">
        <p
          className="font-display font-semibold"
          style={{ fontSize: 'clamp(3.5rem, 14vw, 7rem)', lineHeight: 1, color: BAND_TEXT[cover.band] }}
        >
          {String(cover.score)}
        </p>
        <div className="mt-4">
          <TierLadder ladder={cover.ladder} />
        </div>
        <p className="mt-2 font-body text-base font-bold text-ink">
          {`${cover.caption.tierName} · ${cover.caption.score} of 100`}
        </p>
      </div>

      {/* Full-bleed on narrow screens (main is px-6), column-aligned from sm up. */}
      <div className="-mx-6 mt-8 px-6 py-6 sm:mx-0" style={{ backgroundColor: BAND_FILL[cover.band] }}>
        <p className="font-display text-lg leading-[1.45] sm:text-xl" style={{ color: textOnBand(cover.band) }}>
          {cover.headline}
        </p>
      </div>
      <p className={`mt-3 ${CAPS_LABEL}`}>XPG · CHURCH HEALTH ASSESSMENT</p>
    </div>
  )
}
