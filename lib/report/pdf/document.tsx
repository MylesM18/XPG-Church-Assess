import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportView } from '../view';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';
import { GENEROSITY_COPY } from '../copy';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 48,
          fontFamily: FONT_BODY, fontSize: 11, color: INK, lineHeight: 1.5 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24,
            paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: RULE },
  monogram: { width: 28, height: 28, borderRadius: 14, color: '#FFFFFF',
              fontSize: 12, textAlign: 'center', paddingTop: 8, marginRight: 10 },
  headerText: { flexDirection: 'column' },
  churchName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 },
  headerMeta: { fontSize: 9, color: INK_SOFT },
  h2: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, marginBottom: 6 },
  section: { marginBottom: 18 },
  verdict: { fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 1.4, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', gap: 16, fontSize: 10, color: INK_SOFT },
  stage: { flexDirection: 'row', justifyContent: 'space-between',
           paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE },
  stageConstraint: { fontWeight: 700 },
  stageDownstream: { color: INK_SOFT },
  refs: { fontSize: 9, color: INK_SOFT, marginTop: 4 },
  appendixRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48,
            flexDirection: 'row', justifyContent: 'space-between',
            fontSize: 8, color: INK_SOFT },
});

export interface ReportDocumentProps {
  view: ReportView;
  churchName: string;
  brandColor: string;
  monogram: string;
  generatedAt: Date;
}

export function ReportDocument({
  view, churchName, brandColor, monogram, generatedAt,
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

        <View style={s.section}>
          <Text style={s.verdict}>{view.verdict}</Text>
          <View style={s.scoreRow}>
            <Text>Overall score: {view.throughput}</Text>
            <Text>Confidence: {view.confidence.toFixed(2)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>The chain</Text>
          {view.stages.map((st) => (
            <View key={st.category_id} style={s.stage}>
              <Text style={
                st.bucket === 'constraint' ? s.stageConstraint
                : st.bucket === 'downstream' ? s.stageDownstream
                : undefined
              }>
                {st.name}{st.bucket === 'constraint' ? '  ← your constraint' : ''}
              </Text>
              <Text>{st.score}</Text>
            </View>
          ))}
        </View>

        {view.evidence && (
          <View style={s.section}>
            <Text style={s.h2}>Why we say that</Text>
            <Text>{view.evidence.text}</Text>
            {view.evidence.refs.length > 0 && (
              <Text style={s.refs}>
                {view.evidence.refs.map((r) => `${r.ref}${r.value === null ? '' : `: ${r.value}`}`).join('  ·  ')}
              </Text>
            )}
          </View>
        )}

        {view.blindSpot && (
          <View style={s.section}>
            <Text style={s.h2}>Blind spots</Text>
            <Text>{view.blindSpot}</Text>
          </View>
        )}

        {view.cost && (
          <View style={s.section}>
            <Text style={s.h2}>What it is costing you</Text>
            <Text>{view.cost.cost}</Text>
            {view.cost.doNotWorkOn && <Text style={s.refs}>{view.cost.doNotWorkOn}</Text>}
          </View>
        )}

        {view.gating && (
          <View style={s.section}>
            <Text style={s.h2}>Conditions to clear first</Text>
            <Text>{view.gating}</Text>
          </View>
        )}

        {view.generosityMode !== null && (
          <View style={s.section}>
            <Text style={s.h2}>Generosity</Text>
            <Text>{GENEROSITY_COPY[view.generosityMode]}</Text>
          </View>
        )}

        {view.dispersion && (
          <View style={s.section}>
            <Text style={s.h2}>Where your leaders disagree</Text>
            <Text>{view.dispersion.text}</Text>
            {view.dispersion.respondents.map((r) => (
              <Text key={r.label} style={s.refs}>{r.label}: {r.mean.toFixed(1)}</Text>
            ))}
          </View>
        )}

        {view.nextStep && (
          <View style={s.section}>
            <Text style={s.h2}>Your next step</Text>
            <Text>{view.nextStep.text}</Text>
            <Text style={s.refs}>{view.nextStep.callType} — {view.nextStep.hook}</Text>
          </View>
        )}

        <View style={s.section} break>
          <Text style={s.h2}>Appendix — all category scores</Text>
          {view.appendix.categories.map((c) => (
            <View key={c.category_id} style={s.appendixRow}>
              <Text>{c.name}</Text>
              <Text>{c.score}</Text>
            </View>
          ))}
          <Text style={s.caveat}>{view.appendix.benchmarkNote}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Internal leadership document</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
