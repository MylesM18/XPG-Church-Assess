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
  const element = createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
