// Source-reading tripwire (node env, no DOM): the public /r/[shareToken] report is an async RSC
// that cannot be unit-rendered, so we assert on its source that it renders the shared BookingCta
// — after the whole 13-section <ReportSections> report, as page chrome. Booking a free call is
// not an admin-only action; a forwarded reader is a prime lead, so the CTA shows on this surface
// too (spec §5). Mirrors tests/access/accept-anonymity-note.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const page = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'r', '[shareToken]', 'page.tsx'), 'utf8'),
);

describe('shared report booking CTA', () => {
  it('imports the BookingCta component from the report surface', () => {
    expect(page, 'the shared page must import BookingCta').toContain('BookingCta');
  });

  it('renders <BookingCta /> after the report sections', () => {
    // BOTH anchors are guarded. An ordering assertion with one unguarded anchor is
    // fail-open: a missing needle yields indexOf === -1, which quietly satisfies any
    // `greaterThan` comparison against a real index.
    expect(page, 'the CTA must be rendered').toContain('<BookingCta');
    expect(page, 'the shared page must render <ReportSections>').toContain('<ReportSections');
    expect(
      page.indexOf('<BookingCta'),
      'the booking CTA is page chrome and must follow the whole report, not sit inside it',
    ).toBeGreaterThan(page.indexOf('<ReportSections'));
  });
});
