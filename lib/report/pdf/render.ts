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
  if (props.view.dispersion?.respondents.length) {
    throw new Error('renderReportDocument: view carries respondent names; expected audience "pdf"');
  }

  const element = createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
