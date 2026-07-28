import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportView, SystemView, AreaDossierView } from '../view';
import type { EdgeRead } from '../../engine/dependencies';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const BERRY = '#8E2B3E'; // RESERVED: diagnosis/constraint/active only (app/globals.css --color-berry)

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

  // Layer 1 — the verdict (mirrors app/app/[churchId]/diagnosis/report/cover.tsx)
  coverSection: { alignItems: 'center', marginBottom: 20, paddingBottom: 16,
                  borderBottomWidth: 1, borderBottomColor: RULE },
  // No letterSpacing here: react-pdf renders it as real glyph-position offsets, which pushed
  // pdf-parse's word-join heuristic into splitting "OVERALL CHURCH HEALTH" into stray single
  // letters ("OV E R A L L ...") under test — confirmed by rendering and inspecting the actual
  // extracted text, not guessed.
  coverLabel: { fontSize: 9, color: INK_SOFT, textTransform: 'uppercase' },
  coverScore: { fontFamily: FONT_DISPLAY, fontSize: 32, marginTop: 4 },
  coverSub: { fontSize: 10, color: INK_SOFT, marginTop: 4 },
  coverConstraint: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  coverGated: { fontSize: 10, color: BERRY, marginTop: 4, textAlign: 'center' },
  confidenceRow: { fontSize: 10, color: INK_SOFT, marginBottom: 4 },
  verdict: { fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 1.4, marginBottom: 4 },

  // Layer 1 — AreaTable
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 3 },
  tableHeaderText: { fontSize: 9, color: INK_SOFT },
  tableCellName: { flex: 2, fontSize: 10 },
  tableCellSmall: { flex: 1, fontSize: 10 },

  // Layer 2 — the chain walk
  stage: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
           paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE },
  stageConstraint: { fontWeight: 700 },
  stageDownstream: { color: INK_SOFT },
  stageNote: { fontSize: 9, color: INK_SOFT, marginTop: 2 },
  refs: { fontSize: 9, color: INK_SOFT, marginTop: 4 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },

  // Layer 2 — dependency map
  depGroup: { marginBottom: 10 },
  depGroupHeading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 11, marginBottom: 4 },
  depItem: { marginBottom: 6 },
  depStatement: { fontSize: 9, color: INK_SOFT },
  depLine: { fontSize: 10.5 },
  depCorr: { fontSize: 9, color: INK_SOFT, marginTop: 1 },

  // Layer 3 — area dossiers
  dossier: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: RULE },
  dossierHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dossierName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 12 },
  dossierMeta: { fontSize: 9, color: INK_SOFT },
  fieldRow: { marginTop: 4 },
  fieldLabel: { fontSize: 8, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 10, marginTop: 1 },

  // Layer 4 — appendix
  appendixRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
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

/**
 * UI-only presentation mapping, deliberately duplicated from (not imported from)
 * app/app/[churchId]/diagnosis/report/cover.tsx's identical private helper: that
 * file returns DOM elements (h1/p/table), which @react-pdf/renderer's reconciler
 * cannot render, so the component itself cannot be reused here — only the pure
 * band logic can, and cover.tsx does not export it. Exported (only from this
 * file — cover.tsx's own copy stays private) so tests/report/audience-parity.test.ts
 * can pin the 0.75/0.5 thresholds by calling this directly and comparing it against
 * cover.tsx's real behavior via its exported VerdictHeader component at the same
 * boundary values — that test is what actually keeps the two copies in agreement;
 * keep both in sync by hand if you ever touch either.
 */
export function confidenceBand(c: number): { label: string; low: boolean } {
  if (c >= 0.75) return { label: 'High', low: false };
  if (c >= 0.5) return { label: 'Moderate', low: false };
  return { label: 'Low', low: true };
}

/** Mirrors cover.tsx's private scoreBand() — see confidenceBand() above for why this is a
 *  duplicate rather than an import. Thresholds are methodology/rules.yaml's own
 *  thresholds.severe=25 / thresholds.break=thresholds.gate=45 (the stable, meaningful cut
 *  points in this domain), not a fourth invented scale. */
function scoreBand(score: number): string {
  if (score < 25) return 'Severe';
  if (score < 45) return 'Broken';
  return 'Holding';
}

// Mirrors system.tsx's private READ_ORDER/READ_LABEL/readSentence/relationshipLine — same
// "cannot import a DOM component" constraint as confidenceBand/scoreBand above.
const DEP_READ_ORDER = ['load_bearing', 'at_risk', 'clear', 'both_strong'] as const satisfies readonly EdgeRead[];

const DEP_READ_LABEL: Record<string, string> = {
  load_bearing: 'Load-bearing',
  at_risk: 'At risk',
  clear: 'Clear',
  both_strong: 'Both holding',
};

function depReadSentence(fromName: string, toName: string, read: string): string {
  const fLower = fromName.toLowerCase();
  const tLower = toName.toLowerCase();
  switch (read) {
    case 'load_bearing':
      return `${fromName} is weak here too — this dependency is active and part of what's costing you.`;
    case 'clear':
      return `${fromName} is holding — so ${fLower} is not what's capping your ${tLower}.`;
    case 'at_risk':
      return `${toName} is holding for now, but ${fLower} is weak — it's running on borrowed time.`;
    default: // 'both_strong'
      return 'Both are holding — nothing to flag here.';
  }
}

function depRelationshipLine(e: SystemView['dependencies'][number]): string {
  const verb = e.kind === 'gate' ? 'gates' : 'feeds';
  return `${e.fromName} (${e.fromScore}) ${verb} ${e.toName} (${e.toScore}). ${depReadSentence(e.fromName, e.toName, e.read)}`;
}

// Mirrors dossier.tsx's private UNAVAILABLE/field() — same constraint again: dossier.tsx
// returns <dt>/<dd> DOM elements, so only the literal copy and the join/null logic travel
// here, not the component itself. The literal string must match dossier.tsx's byte for byte:
// it is copy a customer reads, not layout, and tests/report/components.test.ts already pins
// the screen side of this exact string.
const UNAVAILABLE = 'Not available for this area.';

function fieldBody(value: string | string[] | null): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(' · ') : UNAVAILABLE;
  return value ?? UNAVAILABLE;
}

function DossierField({ label, value }: { label: string; value: string | string[] | null }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{fieldBody(value)}</Text>
    </View>
  );
}

/** One inline area dossier — never collapsed (PDF cannot collapse anyway; spec §7.8).
 *  `wrap={false}` keeps a single area's six fields from splitting across a page boundary. */
function AreaDossierBlock({ area }: { area: AreaDossierView }) {
  return (
    <View style={s.dossier} wrap={false}>
      <View style={s.dossierHeaderRow}>
        <Text style={s.dossierName}>{area.name}</Text>
        <Text style={s.dossierMeta}>{`${area.score}  ·  N=${area.n}`}</Text>
      </View>
      <DossierField label="Reading" value={area.reading} />
      <DossierField label="Inside it" value={area.insideIt} />
      <DossierField label="Agreement" value={area.agreement} />
      <DossierField label="Position" value={area.position} />
      <DossierField label="Depends on" value={area.dependsOn} />
      <DossierField label="Watch for" value={area.watchFor} />
    </View>
  );
}

export function ReportDocument({
  view, churchName, brandColor, monogram, generatedAt,
}: ReportDocumentProps) {
  const dateLabel = generatedAt.toISOString().slice(0, 10);
  const confidence = confidenceBand(view.confidence);
  const chainIds = view.stages.map((st) => st.category_id);
  const anyDownstreamStage = view.stages.some((st) => st.bucket === 'downstream');

  const depNames = new Map<string, string>();
  for (const e of view.system.dependencies) {
    depNames.set(e.from, e.fromName);
    depNames.set(e.to, e.toName);
  }
  const unexpectedCorrelations = view.system.correlations.filter((c) => c.verdict === 'unexpected');

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

        {/* Layer 1 — the verdict: CoverCard · VerdictHeader · AreaTable (spec §7 Layer 1;
            no PDF/Share buttons here — those are screen-only admin chrome). */}
        <View style={s.coverSection}>
          <Text style={s.coverLabel}>Overall church health</Text>
          <Text style={s.coverScore}>{`${view.cover.throughput}%`}</Text>
          <Text style={s.coverSub}>{`Capacity ${view.cover.capacity}  ·  Gap ${view.cover.gap} pts`}</Text>
          <Text style={s.coverConstraint}>
            {view.cover.constraintName ? `Constraint: ${view.cover.constraintName}` : 'Constraint: none — every stage holding'}
          </Text>
          {view.cover.gatedBy.length > 0 && (
            <Text style={s.coverGated}>
              {`⚠ Gated by: ${view.cover.gatedBy.map((g) => `${g.name} (${g.score})`).join(', ')}`}
            </Text>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.confidenceRow}>{`Confidence: ${confidence.label}`}</Text>
          <Text style={s.verdict}>{view.verdict}</Text>
          {confidence.low && (
            <Text style={s.refs}>Based on limited responses — add respondents to sharpen this.</Text>
          )}
        </View>

        <View style={s.section}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, s.tableCellName]}>Area</Text>
            <Text style={[s.tableHeaderText, s.tableCellSmall]}>Score</Text>
            <Text style={[s.tableHeaderText, s.tableCellSmall]}>N</Text>
            <Text style={[s.tableHeaderText, s.tableCellSmall]}>Band</Text>
          </View>
          {view.areas.map((area) => (
            <View key={area.category_id} style={s.tableRow}>
              <Text style={s.tableCellName}>{area.name}</Text>
              <Text style={s.tableCellSmall}>{area.score}</Text>
              <Text style={s.tableCellSmall}>{area.n}</Text>
              <Text style={s.tableCellSmall}>{scoreBand(area.score)}</Text>
            </View>
          ))}
        </View>

        {/* Layer 2 — how your system behaves */}
        <View style={s.section}>
          <Text style={s.h2}>The chain walk</Text>
          {view.stages.map((st) => {
            const isConstraint = st.bucket === 'constraint';
            const isDownstream = st.bucket === 'downstream';
            const label = isConstraint ? 'Constraint' : isDownstream ? 'Downstream' : 'Holding';
            return (
              <View key={st.category_id} style={s.stage}>
                <View>
                  <Text style={isConstraint ? s.stageConstraint : isDownstream ? s.stageDownstream : undefined}>
                    {st.name}{isConstraint ? '  ← your constraint' : ''}
                  </Text>
                  {isConstraint && <Text style={s.stageNote}>Your constraint — work here first.</Text>}
                  {isDownstream && st.isDoNotWorkOn && <Text style={s.stageNote}>Symptom of the constraint</Text>}
                </View>
                <Text style={isDownstream ? s.stageDownstream : undefined}>{`${label} · ${st.score}`}</Text>
              </View>
            );
          })}
          {anyDownstreamStage && <Text style={s.caveat}>Don’t work on the faded stages yet.</Text>}
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

        {view.cost && (
          <View style={s.section}>
            <Text style={s.h2}>What it is costing you</Text>
            <Text>{view.cost.cost}</Text>
            {view.cost.doNotWorkOn && <Text style={s.refs}>{view.cost.doNotWorkOn}</Text>}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.h2}>How your areas depend on each other</Text>
          {DEP_READ_ORDER.map((read) => {
            const edges = view.system.dependencies.filter((e) => e.read === read);
            if (edges.length === 0) return null;
            return (
              <View key={read} style={s.depGroup}>
                <Text style={s.depGroupHeading}>{DEP_READ_LABEL[read]}</Text>
                {edges.map((e) => {
                  const corr = view.system.correlations.find(
                    (c) => (c.from === e.from && c.to === e.to) || (c.from === e.to && c.to === e.from),
                  );
                  return (
                    <View key={`${e.from}-${e.to}`} style={s.depItem}>
                      <Text style={s.depStatement}>{e.statement}</Text>
                      <Text style={s.depLine}>{depRelationshipLine(e)}</Text>
                      {corr && (
                        <Text style={s.depCorr}>
                          {`Correlation ${corr.verdict.replace('_', ' ')} — r=${corr.r.toFixed(2)} (n=${corr.n})`}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {unexpectedCorrelations.length > 0 && (
            <View style={s.depGroup}>
              <Text style={s.depGroupHeading}>Unexpected findings</Text>
              {unexpectedCorrelations.map((c) => (
                <Text key={`${c.from}-${c.to}`} style={s.depLine}>
                  {`${depNames.get(c.from) ?? c.from} ↔ ${depNames.get(c.to) ?? c.to}: r=${c.r.toFixed(2)} (n=${c.n})`}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Calibration</Text>
          <Text>{view.system.calibrationText}</Text>
        </View>

        {view.system.disagreement && (
          <View style={s.section}>
            <Text style={s.h2}>Where your leaders disagree</Text>
            <Text>{view.system.disagreement.text}</Text>
            {view.system.disagreement.respondents.map((r) => (
              <Text key={r.label} style={s.refs}>{r.label}: {r.mean.toFixed(1)}</Text>
            ))}
          </View>
        )}

        {view.system.gating && (
          // Flags never headline — a muted secondary note (spec §6.2 row 6), same as
          // system.tsx's GatingFlags: no heading, just the sentence.
          <View style={s.section}>
            <Text style={s.caveat}>{view.system.gating}</Text>
          </View>
        )}

        {/* Layer 3 — the eight areas, fixed chain-then-enabler order (same order as
            view.areas itself — never re-sorted here). `break` starts this on a fresh
            page since eight inline dossiers are substantial content. */}
        <View style={s.section} break>
          <Text style={s.h2}>The eight areas</Text>
        </View>
        {view.areas.map((area) => (
          <AreaDossierBlock key={area.category_id} area={area} />
        ))}

        {/* Layer 4 — what to do. No generated 30/60/90 roadmap (spec §7.6). */}
        {view.nextStep && (
          <View style={s.section}>
            <Text style={s.h2}>Your next step</Text>
            <Text>{view.nextStep.text}</Text>
            <Text style={s.refs}>{view.nextStep.callType} — {view.nextStep.hook}</Text>
          </View>
        )}

        <View style={s.section} break>
          <Text style={s.h2}>Appendix — all category scores</Text>
          {view.appendix.categories.map((c) => {
            const idx = chainIds.indexOf(c.category_id);
            const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler';
            return (
              <View key={c.category_id} style={s.appendixRow}>
                <Text>{`${c.name} (${tag})`}</Text>
                <Text>{`${c.score}${c.cohort_percentile !== null ? ` · ${c.cohort_percentile}th pct` : ''}`}</Text>
              </View>
            );
          })}
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
