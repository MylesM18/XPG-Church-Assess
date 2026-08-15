// Source-reading tripwire (node env, no DOM): the public /r/[shareToken] report is an async RSC
// that cannot be unit-rendered. Since the web re-skin (Part B) the booking CTA is rendered by
// <ReportSections> itself, once, immediately after s12 — the same place the PDF puts it
// (lib/report/pdf/document.tsx). The share page therefore must NOT render its own trailing
// <BookingCta /> (it would duplicate), and the CTA still reaches a forwarded reader because it
// rides inside <ReportSections>. The in-report placement itself is pinned by rendering in
// tests/report/web-sections.test.ts; this file pins the page side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const page = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'r', '[shareToken]', 'page.tsx'), 'utf8'),
);
const sections = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'report', 'sections.tsx'), 'utf8'),
);

describe('shared report booking CTA', () => {
  it('renders <ReportSections>, which carries the booking CTA after s12', () => {
    expect(page, 'the shared page must render <ReportSections>').toContain('<ReportSections');
    expect(sections, 'ReportSections must render the shared CTA constant').toContain("from '@/lib/report/cta'");
    expect(sections).toContain('bookingCta.url');
    expect(sections).toContain("section.id === 's12'");
  });

  it('does not render a second, page-chrome BookingCta after the report', () => {
    expect(page).not.toContain('<BookingCta');
  });
});
