import { Document, Page, Text, View, Link, Svg, Rect, G, StyleSheet } from '@react-pdf/renderer';
import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '../../ai/sections';
import type { AiSectionId } from '../../ai/sections';
import type { AssembledSection } from '../compose';
import type { SectionBody } from '../fallback-sections';
import { bookingCta } from '../cta';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';
import { PdfChart } from './charts';
import { PdfBlock } from './blocks';
import { BAND_FILL, BAND_TEXT, BAND_NAME, textOnBand, areaIndexFrom, type AreaIndex, type CoverModel } from '../charts';

// Re-exported so existing PDF-side imports and tests (tests/report/pdf-document.test.ts) keep
// working; the definitions moved to the shared seam so the web renderer can use them too.
export { areaIndexFrom, type AreaIndex } from '../charts';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const CREAM = '#FAF7F0';

const s = StyleSheet.create({
  page: { backgroundColor: CREAM, paddingTop: 64, paddingBottom: 56, paddingHorizontal: 48, fontFamily: FONT_BODY, fontSize: 10.5, lineHeight: 1.5, color: INK },
  monogram: { width: 28, height: 28, borderRadius: 14, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 12, textAlign: 'center', paddingTop: 7, marginRight: 8 },
  section: { marginBottom: 18 },
  body: { marginBottom: 6 },
  bullet: { marginBottom: 2, paddingLeft: 10 },
  aiHeading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 11, marginBottom: 2 },
  block: { marginBottom: 8 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },
  chart: { marginTop: 6, marginBottom: 6 },
  ctaHeading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, color: INK },
  ctaButton: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: INK, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, textDecoration: 'none' },
  runhead: { position: 'absolute', top: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between' },
  opener: { paddingVertical: 12, paddingHorizontal: 16, marginBottom: 18 },
  openerNumber: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1 },
  openerTitle: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 26, lineHeight: 1.2 },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  capsLabel: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: INK_SOFT },
  dossierHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dossierTab: { paddingVertical: 2, paddingHorizontal: 6, marginRight: 8 },
  dossierTabText: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1 },
  dossierName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, color: INK, flexGrow: 1 },
  dossierScore: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24 },
});

const cs = StyleSheet.create({
  coverPage: { backgroundColor: CREAM, paddingTop: 64, paddingHorizontal: 48, paddingBottom: 0, fontFamily: FONT_BODY, color: INK },
  coverChurch: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, marginTop: 18 },
  coverKicker: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: INK_SOFT, marginTop: 4 },
  coverDate: { fontSize: 10.5, color: INK_SOFT, marginTop: 2 },
  coverHero: { marginTop: 70 },
  coverScoreLabel: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: INK_SOFT, marginBottom: 4 },
  coverScore: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 84 },
  coverCaption: { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 10.5, marginTop: 10 },
  coverFoot: { position: 'absolute', left: 0, right: 0, bottom: 44, paddingVertical: 26, paddingHorizontal: 48 },
  coverHeadline: { fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 15, lineHeight: 1.45 },
  coverRunline: { position: 'absolute', bottom: 20, left: 48, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: INK_SOFT },
});

/**
 * The cover's 4-segment band strip (spec §2.5): SEVERE/BROKEN/WATCH/HOLDING swatches with an ink
 * marker at the overall score's plotted position. Geometry comes entirely off `cover.strip` —
 * this component never recomputes coordinates, mirroring PdfChart's contract with ChartModel.
 */
function CoverStrip({ cover }: { cover: CoverModel }) {
  const markerX = Math.max(1, Math.min(cover.strip.marker.x, cover.strip.width - 1)) - 1;
  return (
    <Svg width={499} height={44} viewBox={`0 0 ${cover.strip.width} 44`}>
      {cover.strip.segments.map((seg) => (
        <G key={seg.band}>
          <Rect x={seg.x} y={8} width={seg.w} height={14} fill={BAND_FILL[seg.band]} />
          <Text x={seg.x} y={38} fill={INK_SOFT} style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5 }}>
            {seg.name.toUpperCase()}
          </Text>
        </G>
      ))}
      <Rect x={markerX} y={0} width={2} height={30} fill={INK} />
    </Svg>
  );
}

export interface ReportDocumentProps {
  sections: AssembledSection[];
  churchName: string;
  brandColor: string;
  monogram: string;
  generatedAt: Date;
  /**
   * The respondent labels the facts pack was built from — the SAME value the resolver was handed
   * as `labelSource`, never a second knownLabels() call. The fail-closed guard in ./render.ts
   * checks the sections against exactly this list; a guard checking a different list than the one
   * the report was built from would fail open.
   */
  labels: readonly string[];
  /**
   * A report exists for this run but not for these inputs. Renders as a cover-page caveat.
   *
   * It used to render at the foot of the appendix, which was the last thing in the document.
   * With the appendix gone (2026-08-16) the caveat had no home, and appending it to s12 would
   * have buried a provenance warning behind twelve sections and the booking CTA. The cover is
   * also where the WEB surface puts its stale notice (app/app/[churchId]/diagnosis/page.tsx
   * renders it above the cover), so the two surfaces now agree on placement as well as wording.
   */
  stale: boolean;
  /** Cover model computed in resolve; the document never reads facts. */
  cover: CoverModel;
}

const STALE_CAVEAT =
  'This export was produced from the current assessment data. A previously generated narrative report exists for different settings and is not shown here.';

/**
 * The uniform renderer: the { body, bullets } half of a SectionBody. Used for every
 * source:'fallback' section. The title is rendered by ReportDocument, never here — one title
 * source for both branches, mirroring SectionBodyView in
 * app/app/[churchId]/diagnosis/report/sections.tsx.
 */
function SectionBodyView({ body, bullets }: { body: string; bullets: string[] }) {
  return (
    <>
      <Text style={s.body}>{body}</Text>
      {bullets.map((bullet) => (
        <Text key={bullet} style={s.bullet}>{`•  ${bullet}`}</Text>
      ))}
    </>
  );
}

type AiRendererProps = { ai: unknown; fallback: SectionBody };

/** Every AI renderer's failure path: the section's own deterministic fallback. */
function AiFallback({ fallback }: { fallback: SectionBody }) {
  return <SectionBodyView body={fallback.body} bullets={fallback.bullets} />;
}

function S2View({ ai, fallback }: AiRendererProps) {
  const parsed = S2Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { summary, what_this_is_not, context_bullets } = parsed.data;
  return (
    <>
      <Text style={s.body}>{summary}</Text>
      <Text style={s.body}>{what_this_is_not}</Text>
      {context_bullets.map((bullet) => (
        <Text key={bullet} style={s.bullet}>{`•  ${bullet}`}</Text>
      ))}
    </>
  );
}

function S4View({ ai, fallback }: AiRendererProps) {
  const parsed = S4Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { thesis_word, narrative } = parsed.data;
  return (
    <>
      <Text style={s.aiHeading}>{thesis_word}</Text>
      <Text style={s.body}>{narrative}</Text>
    </>
  );
}

function S5View({ ai, fallback }: AiRendererProps) {
  const parsed = S5Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.strengths.map((strength) => (
        <View key={strength.category_id} style={s.block}>
          <Text style={s.aiHeading}>{strength.heading}</Text>
          <Text style={s.body}>{strength.body}</Text>
        </View>
      ))}
    </>
  );
}

function S6View({ ai, fallback, areaIndex }: AiRendererProps & { areaIndex: AreaIndex }) {
  const parsed = S6Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.areas.map((area) => {
        const meta = areaIndex.get(area.category_id);
        return (
          <View key={area.category_id} style={s.block} wrap={false}>
            {meta && (
              <View style={s.dossierHead}>
                <View style={[s.dossierTab, { backgroundColor: BAND_FILL[meta.band] }]}>
                  <Text style={[s.dossierTabText, { color: textOnBand(meta.band) }]}>{BAND_NAME[meta.band].toUpperCase()}</Text>
                </View>
                <Text style={s.dossierName}>{meta.name}</Text>
                <Text style={[s.dossierScore, { color: BAND_TEXT[meta.band] }]}>{String(meta.score)}</Text>
              </View>
            )}
            <Text style={s.body}>{area.affirm}</Text>
            <Text style={s.body}>{area.pivot}</Text>
            <Text style={s.body}>{area.evidence}</Text>
            <Text style={s.body}>{area.not_statement}</Text>
            <Text style={s.body}>{area.reframe}</Text>
            <Text style={s.body}>{area.trajectory}</Text>
          </View>
        );
      })}
    </>
  );
}

function S7View({ ai, fallback }: AiRendererProps) {
  const parsed = S7Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { narrative, pattern_claim } = parsed.data;
  return (
    <>
      <Text style={s.body}>{narrative}</Text>
      {pattern_claim !== null && <Text style={s.body}>{pattern_claim}</Text>}
    </>
  );
}

function S9View({ ai, fallback }: AiRendererProps) {
  const parsed = S9Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { narrative, working_model } = parsed.data;
  return (
    <>
      <Text style={s.body}>{narrative}</Text>
      <Text style={s.body}>{working_model}</Text>
    </>
  );
}

function S12View({ ai, fallback }: AiRendererProps) {
  const parsed = S12Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { assessment, overall_percent, tier_name, primary_objective } = parsed.data;
  return (
    <>
      <Text style={s.body}>{assessment}</Text>
      <Text style={s.bullet}>{`•  Overall: ${overall_percent}%`}</Text>
      <Text style={s.bullet}>{`•  Tier: ${tier_name}`}</Text>
      <Text style={s.bullet}>{`•  Primary objective: ${primary_objective}`}</Text>
    </>
  );
}

/**
 * Narrows `section.id: SectionId` (13 possible values) down to `AiSectionId` (the 7 that have a
 * renderer). The co-occurrence of `source === 'ai'` with one of these ids is a compose.ts runtime
 * invariant, not something the type system tracks on its own.
 */
function isAiSectionId(id: AssembledSection['id']): id is AiSectionId {
  return (AI_SECTION_IDS as readonly string[]).includes(id);
}

/**
 * Dispatches a section's body content: its own AI renderer when source is 'ai' and that id is one
 * of the seven AI sections, the shared deterministic view otherwise.
 *
 * The `never` check in the default arm is the compile-time guarantee: add an eighth id to
 * AiSectionId without a case here, and tsc — not a human — fails the build. Keep the switch;
 * a Record/Map lookup is what the web renderer avoided for eslint's react-hooks/static-components.
 */
function SectionContent({
  section, areaIndex,
}: {
  section: AssembledSection;
  areaIndex: AreaIndex;
}) {
  if (section.source === 'ai' && isAiSectionId(section.id)) {
    const { id, ai, fallback } = section;
    switch (id) {
      case 's2':
        return <S2View ai={ai} fallback={fallback} />;
      case 's4':
        return <S4View ai={ai} fallback={fallback} />;
      case 's5':
        return <S5View ai={ai} fallback={fallback} />;
      case 's6':
        return <S6View ai={ai} fallback={fallback} areaIndex={areaIndex} />;
      case 's7':
        return <S7View ai={ai} fallback={fallback} />;
      case 's9':
        return <S9View ai={ai} fallback={fallback} />;
      case 's12':
        return <S12View ai={ai} fallback={fallback} />;
      default: {
        const _exhaustive: never = id;
        return _exhaustive;
      }
    }
  }
  return <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />;
}

/**
 * Groups the 12 sections into content pages (spec §2.7): each group becomes one `<Page>` with a
 * fixed runhead/footer and a verdict-tint opener per section inside it. s3 (verdict block + the
 * 8-area stat grid) gets its own page: pairing it with s4, as the plan literally specified, filled
 * page 3 with s3's content and left page 4 carrying only the s4 opener plus a line or two — an
 * orphaned opener on a near-blank trailing page for every 8-area church (spec §6 "no near-blank
 * trailing pages"). s4 pairs with s5 instead. A section id missing from this list still gets its
 * own single-section page (see the defensive loop in pageGroupsFor) so a future report.yaml id
 * can't silently vanish from the PDF.
 */
export const PAGE_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['s1', 's2'],
  ['s3'],
  ['s4', 's5'],
  ['s6'],
  ['s7', 's8'],
  ['s9', 's10'],
  // s12 before s11 since the 2026-08-19 reorder: the partner section closes the report,
  // directly above the booking CTA on this final page.
  ['s12', 's11'],
];

type PageGroup = { key: string; sections: Array<{ section: AssembledSection; number: string; title: string }> };

/**
 * Reads each section's fallback title exactly once, here — the opener and the footer's running
 * head both consume the precomputed `title` field below rather than re-deriving it from the
 * section's fallback themselves, preserving the "one title source" invariant pdf-sections.test.ts
 * asserts.
 */
function toGroupEntry(section: AssembledSection, numberFor: Map<string, string>) {
  return { section, number: numberFor.get(section.id) ?? '00', title: section.fallback.title };
}

function pageGroupsFor(sections: AssembledSection[]): PageGroup[] {
  const numberFor = new Map(sections.map((sec, i) => [sec.id, String(i + 1).padStart(2, '0')]));
  const grouped = new Set(PAGE_GROUPS.flat());
  const groups: PageGroup[] = PAGE_GROUPS.map((ids) => ({
    key: ids.join('-'),
    sections: sections.filter((sec) => ids.includes(sec.id)).map((sec) => toGroupEntry(sec, numberFor)),
  })).filter((g) => g.sections.length > 0);
  // Defensive: see the PAGE_GROUPS comment above.
  for (const sec of sections) {
    if (!grouped.has(sec.id)) groups.push({ key: sec.id, sections: [toGroupEntry(sec, numberFor)] });
  }
  return groups;
}

/**
 * The PDF mirror of app/app/[churchId]/diagnosis/report/sections.tsx. Same 12 sections, same
 * order, same one-title-source rule — different primitives, because @react-pdf/renderer cannot
 * render DOM components and never could.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport returns them in
 * Object.keys(methodology.report.sections) order, which is report.yaml order.
 */
export function ReportDocument({
  sections, churchName, brandColor, monogram, generatedAt, stale, cover,
}: ReportDocumentProps) {
  const areaIndex = areaIndexFrom(sections);
  return (
    <Document title={`${churchName} — Church Health Diagnosis`}>
      <Page size="A4" style={cs.coverPage}>
        {/* monogram: copy of the existing content-header monogram markup verbatim;
            Task 12 deletes the content-header original so it lives only here. */}
        <Text style={[s.monogram, { backgroundColor: brandColor }]}>{monogram}</Text>
        <Text style={cs.coverChurch}>{churchName}</Text>
        <Text style={cs.coverKicker}>CHURCH HEALTH ASSESSMENT</Text>
        <Text style={cs.coverDate}>
          {generatedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </Text>
        <View style={cs.coverHero}>
          <Text style={cs.coverScoreLabel}>{cover.scoreLabel.toUpperCase()}</Text>
          <Text style={[cs.coverScore, { color: BAND_TEXT[cover.band] }]}>{String(cover.score)}</Text>
          <CoverStrip cover={cover} />
          <Text style={cs.coverCaption}>{`${cover.caption.tierName} · ${cover.caption.score} of 100`}</Text>
        </View>
        <View style={[cs.coverFoot, { backgroundColor: BAND_FILL[cover.band] }]}>
          <Text style={[cs.coverHeadline, { color: textOnBand(cover.band) }]}>{cover.headline}</Text>
        </View>
        {stale && <Text style={s.caveat}>{STALE_CAVEAT}</Text>}
        <Text style={cs.coverRunline}>XPG · CHURCH HEALTH ASSESSMENT</Text>
      </Page>

      {pageGroupsFor(sections).map((group) => (
        <Page key={group.key} size="A4" style={s.page} wrap>
          <View fixed style={s.runhead}>
            <Text style={s.capsLabel}>{churchName.toUpperCase()}</Text>
            <Text style={s.capsLabel}>CHURCH HEALTH ASSESSMENT</Text>
          </View>

          {group.sections.map(({ section, number, title }) => (
            <View key={section.id}>
              <View minPresenceAhead={140} style={[s.opener, { backgroundColor: BAND_FILL[cover.band] }]}>
                <Text style={[s.openerNumber, { color: textOnBand(cover.band) }]}>{number}</Text>
                <Text style={[s.openerTitle, { color: textOnBand(cover.band) }]}>{title}</Text>
              </View>
              {section.charts.map((chart) => (
                <View key={chart.kind} style={s.chart}>
                  <PdfChart model={chart} />
                </View>
              ))}
              <SectionContent section={section} areaIndex={areaIndex} />
              {section.blocks.map((block) => (
                <PdfBlock key={block.kind} model={block} />
              ))}
            </View>
          ))}

          {/* s11 ("Where XPG can partner") closes the report since the 2026-08-19 reorder;
              the CTA renders at the end of its page, directly under the partner brief. */}
          {group.sections.some(({ section }) => section.id === 's11') ? (
            <View style={s.section}>
              <Text style={s.ctaHeading}>{bookingCta.heading}</Text>
              <Text style={s.body}>{bookingCta.body}</Text>
              <Link src={bookingCta.url} style={s.ctaButton}>{bookingCta.buttonLabel}</Link>
            </View>
          ) : null}

          <View fixed style={s.footer}>
            <Text
              style={s.capsLabel}
              render={({ pageNumber }) => `${pageNumber} · ${group.sections[0]?.title ?? ''}`}
            />
            <Text style={s.capsLabel}>CONFIDENTIAL</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
