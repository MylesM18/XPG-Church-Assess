import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { ReportDocument, type ReportDocumentProps } from './document';

/**
 * Renders the report PDF to a Buffer. The single home for the type cast this
 * requires: renderToBuffer expects a ReactElement<DocumentProps> — i.e. a
 * literal <Document>. ReportDocument is a wrapper component that renders one,
 * so the element shape at runtime is correct but the prop types
 * (ReportDocumentProps vs DocumentProps) don't structurally overlap, and no
 * single `as` bridges them. Both the production route and the test suite
 * call this instead of `renderToBuffer` directly, so the cast lives in
 * exactly one place.
 */
export function renderReportDocument(props: ReportDocumentProps): Promise<Buffer> {
  // Fail-closed invariant: this function must never print respondent names.
  // view.ts alone decides what gets stripped for the 'pdf' audience — this
  // only asserts that decision was actually applied to whatever view we were
  // handed, so a stray caller or a typo'd audience literal can't ship names
  // past the permission wall.
  //
  // Two independent fields carry the same names today (lib/report/view.ts: `dispersion` at
  // :54, `system.disagreement` at :40), stripped by two independent sites (:256-257 and
  // :320-326) — legacy and current source-of-truth respectively (Task 16). document.tsx
  // renders from `system.disagreement`, not `dispersion`; checking only `dispersion` here would
  // let this guard silently stop watching the field the renderer actually reads the moment the
  // two fields' strip logic ever diverges, or `dispersion` is retired. Check both.
  if (props.view.dispersion?.respondents.length || props.view.system?.disagreement?.respondents.length) {
    throw new Error('renderReportDocument: view carries respondent names; expected audience "pdf"');
  }

  const element = createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
