import type { CoverModel } from '@/lib/report/charts'
import { BAND_FILL, BAND_TEXT, textOnBand } from '@/lib/report/charts'

// The PDF's own ink hexes (lib/report/pdf/document.tsx) for the strip's marker + labels: the SVG
// is a transcription of the PDF drawing, so it uses the PDF tokens, not the web @theme.
const INK = '#1A1A18'
const INK_SOFT = '#5A5A54'

const CAPS_LABEL = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft'

/**
 * The cover's 4-segment band strip — the web transcription of document.tsx's CoverStrip.
 * Every coordinate comes off `cover.strip` (segments + marker.x); this component never
 * recomputes geometry. viewBox width = strip.width, height 44, exactly like the PDF; the SVG
 * scales to the column width.
 *
 * One deliberate divergence from the PDF: the labels are fontSize 12, not the PDF's 7.5. The PDF
 * draws its strip at close to 1:1, but here the 500-unit viewBox scales down to the column (about
 * 327px on a 375px screen, a factor of 0.654), which would render 7.5 at roughly 4.9px. 12 units
 * lands near 7.9px there and still clears the segment width: HOLDING, the longest label, is well
 * under the 125 units a segment gets.
 */
function CoverStrip({ cover }: { cover: CoverModel }) {
  const markerX = Math.max(1, Math.min(cover.strip.marker.x, cover.strip.width - 1)) - 1
  return (
    <svg
      viewBox={`0 0 ${cover.strip.width} 44`}
      className="h-auto w-full"
      role="img"
      aria-label="Health band scale with the overall score marked"
    >
      {cover.strip.segments.map((seg) => (
        <g key={seg.band}>
          <rect x={seg.x} y={8} width={seg.w} height={14} fill={BAND_FILL[seg.band]} />
          <text x={seg.x} y={38} fill={INK_SOFT} fontSize={12} fontWeight={700}>
            {seg.name.toUpperCase()}
          </text>
        </g>
      ))}
      <rect x={markerX} y={0} width={2} height={30} fill={INK} />
    </svg>
  )
}

/**
 * Web mirror of the PDF cover page (lib/report/pdf/document.tsx, ReportDocument's first Page):
 * monogram, church name, kicker, date, hero score, CoverStrip, caption, band-filled foot with
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
          <CoverStrip cover={cover} />
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
