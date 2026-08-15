import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { containsRespondentLabel } from '../anonymity';
import { ReportDocument, type ReportDocumentProps } from './document';

/**
 * Every string reachable inside a value, walked recursively through arrays and plain objects.
 * Used on two shapes below: the untyped AI payload (`ai` is `unknown` — a reports row outlives
 * the code that wrote it, so the guard cannot enumerate fields per section id without going
 * silently blind the moment a schema gains one) and the typed `ChartModel[]` (a discriminated
 * union of objects with nested arrays of objects — this walk recurses into it correctly without
 * needing to know its shape either). Walking the value finds every string in both cases.
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/**
 * Renders the report PDF to a Buffer. The single home for the type cast this requires:
 * renderToBuffer expects a ReactElement<DocumentProps> — i.e. a literal <Document>.
 * ReportDocument is a wrapper component that renders one, so the element shape at runtime is
 * correct but the prop types (ReportDocumentProps vs DocumentProps) don't structurally overlap,
 * and no single `as` bridges them. Both the production route and the test suite call this instead
 * of renderToBuffer directly, so the cast lives in exactly one place.
 */
export function renderReportDocument(props: ReportDocumentProps): Promise<Buffer> {
  // Fail-closed invariant: this function must never print respondent names.
  //
  // Re-homed from the old ReportView model (plan 5 phase 2). The previous version asserted on
  // `view.dispersion.respondents` and `view.system.disagreement.respondents`; both fields died
  // with ReportView. The contract is unchanged in spirit: whatever reaches the PDF renderer
  // carries no respondent label.
  //
  // ⚠️ `props.labels` MUST be the same value the resolver was handed as `labelSource` — one
  // knownLabels(responses) call per request, threaded through. A guard checking a DIFFERENT label
  // list than the one the facts pack was built from is a guard that fails open.
  //
  // Checks fallback body/bullets, every string inside the AI payload, and every string inside
  // this section's chart models (lib/report/charts.ts) — not because chart strings can carry
  // respondent text (they can't: every StatCell/RankRow/VerdictStat string is a category name,
  // item text, theme key or tier name straight off methodology, never respondent-supplied),
  // but so the invariant above is literally true rather than true-except-for-one-payload-shape.
  // Deliberately NOT fallback.title: titles come from report.yaml, never from respondent data,
  // and a label that happens to be a common word would 500 every export.
  //
  // Reuses containsRespondentLabel (../anonymity) rather than a second matcher — it is
  // case-insensitive and skips empty needles, so an empty label list is a no-op.
  for (const section of props.sections) {
    const texts = [
      section.fallback.body,
      ...section.fallback.bullets,
      ...collectStrings(section.ai),
      ...collectStrings(section.charts),
    ];
    for (const text of texts) {
      if (containsRespondentLabel(text, props.labels)) {
        // Reason only — never the offending text, the section, or the label.
        throw new Error(
          `renderReportDocument: section ${section.id} carries a respondent label; refusing to render`,
        );
      }
    }
  }

  const element = createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
