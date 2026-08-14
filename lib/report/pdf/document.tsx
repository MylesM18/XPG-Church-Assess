import { Document, Page, Text, View, Link, StyleSheet } from '@react-pdf/renderer';
import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '../../ai/sections';
import type { AiSectionId } from '../../ai/sections';
import type { AssembledSection } from '../compose';
import type { SectionBody } from '../fallback-sections';
import { bookingCta } from '../cta';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';
import { PdfChart } from './charts';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 48, fontFamily: FONT_BODY, fontSize: 10.5, color: INK, lineHeight: 1.5 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 8 },
  monogram: { width: 28, height: 28, borderRadius: 14, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 12, textAlign: 'center', paddingTop: 7, marginRight: 8 },
  headerText: { flexDirection: 'column' },
  churchName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 },
  headerMeta: { fontSize: 9, color: INK_SOFT },
  h1: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 8 },
  h2: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, marginBottom: 6 },
  section: { marginBottom: 18 },
  body: { marginBottom: 6 },
  bullet: { marginBottom: 2, paddingLeft: 10 },
  aiHeading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 11, marginBottom: 2 },
  block: { marginBottom: 8 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },
  chart: { marginTop: 6, marginBottom: 6 },
  ctaButton: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: INK, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, textDecoration: 'none' },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: INK_SOFT },
});

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
  /** A report exists for this run but not for these inputs. Renders as an appendix caveat. */
  stale: boolean;
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

function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = S6Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.areas.map((area) => (
        <View key={area.category_id} style={s.block}>
          <Text style={s.body}>{area.affirm}</Text>
          <Text style={s.body}>{area.evidence}</Text>
          <Text style={s.body}>{area.reframe}</Text>
        </View>
      ))}
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
function SectionContent({ section }: { section: AssembledSection }) {
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
        return <S6View ai={ai} fallback={fallback} />;
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
 * The PDF mirror of app/app/[churchId]/diagnosis/report/sections.tsx. Same 13 sections, same
 * order, same one-title-source rule — different primitives, because @react-pdf/renderer cannot
 * render DOM components and never could.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport returns them in
 * Object.keys(methodology.report.sections) order, which is report.yaml order.
 */
export function ReportDocument({
  sections, churchName, brandColor, monogram, generatedAt, stale,
}: ReportDocumentProps) {
  const dateLabel = generatedAt.toISOString().slice(0, 10);

  return (
    <Document title={`${churchName} — Church Health Diagnosis`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={[s.monogram, { backgroundColor: brandColor }]}>{monogram}</Text>
          <View style={s.headerText}>
            <Text style={s.churchName}>{churchName}</Text>
            <Text style={s.headerMeta}>Church Health Diagnosis · {dateLabel}</Text>
          </View>
        </View>

        {sections.map((section, index) => (
          <View key={section.id} style={s.section}>
            <Text style={index === 0 ? s.h1 : s.h2}>{section.fallback.title}</Text>
            {section.charts.map((chart) => (
              <View key={chart.kind} style={s.chart}>
                <PdfChart model={chart} />
              </View>
            ))}
            <SectionContent section={section} />
            {stale && section.id === 'appendix' && <Text style={s.caveat}>{STALE_CAVEAT}</Text>}
          </View>
        ))}

        <View style={s.section}>
          <Text style={s.h2}>{bookingCta.heading}</Text>
          <Text style={s.body}>{bookingCta.body}</Text>
          <Link src={bookingCta.url} style={s.ctaButton}>{bookingCta.buttonLabel}</Link>
        </View>

        <View style={s.footer} fixed>
          <Text>Internal leadership document</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
