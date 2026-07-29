// Source-reading tripwire (node env, no DOM): the public /r/[shareToken] report is an async RSC
// that cannot be unit-rendered, so we assert on its source that it renders the shared BookingCta
// — after the (always-absent) NextStep, before the Appendix. Booking a free call is not an
// admin-only action; a forwarded reader is a prime lead, so the CTA shows on this surface too
// (spec §5). Mirrors tests/access/accept-anonymity-note.test.ts.
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

  it('renders <BookingCta /> before the Appendix', () => {
    expect(page, 'the CTA must be rendered').toContain('<BookingCta');
    expect(
      page.indexOf('<BookingCta'),
      'the booking CTA must sit before the Appendix',
    ).toBeLessThan(page.indexOf('<Appendix'));
  });
});
