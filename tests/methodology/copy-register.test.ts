import { describe, expect, it } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { bookingCta } from '@/lib/report/cta';
import { BAND_NAME } from '@/lib/report/charts';

/**
 * House-style guard for the copy layer (docs/brand/xpg-voice.md, decision D1).
 *
 * `style_spine` (methodology/report.yaml) and `SYSTEM_PROMPT` (lib/ai/prose.ts) both instruct the
 * model "No em-dashes". Before this test the deterministic copy in copy.yaml and report.yaml used
 * them heavily, so the same church could receive two differently-punctuated reports depending on
 * whether the AI reword path or the deterministic fallback rendered it. The ban is the resolution;
 * this test is what keeps it true.
 *
 * Scope is deliberately the PARSED values, not the raw file bytes: YAML comments are engineering
 * notes, not copy a church leader ever reads, and they are free to use whatever punctuation reads
 * best. `loadMethodology` also proves the rewritten YAML still satisfies the schema.
 */
function stringLeaves(v: unknown, path: string, out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => stringLeaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) stringLeaves(x, path ? `${path}.${k}` : k, out);
  }
  return out;
}

describe('copy layer register', () => {
  it('uses no em-dash or en-dash in any rendered string', async () => {
    const m = await loadMethodology();
    const offenders = [
      ...stringLeaves(m.copy, 'copy'),
      ...stringLeaves(m.report, 'report'),
      // offers.yaml renders into s11 and the booking CTA, so a leader reads it too. Its
      // `foundation` hook carried an em-dash that the first two sources alone never caught.
      ...stringLeaves(m.offers, 'offers'),
      ...stringLeaves(m.rules.tiers, 'rules.tiers'),
    ].filter(([, s]) => /[—–]/.test(s));
    expect(offenders.map(([path]) => path)).toEqual([]);
  });

  // The booking CTA is a TS constant, not methodology YAML, so the loader-driven check above
  // cannot see it — and it is rendered on all three report surfaces (screen, PDF, share link).
  it('keeps the booking CTA free of em-dashes too', () => {
    expect(/[—–]/.test(bookingCta.body)).toBe(false);
    expect(/[—–]/.test(bookingCta.heading)).toBe(false);
  });

  // The band names are the most-read strings in the report: every area chart is labelled
  // `${category} · ${BAND_NAME[band]}` and the PDF cover strip prints all four. Verdict words
  // there ("Broken", "Severe") read as a judgement on the people in that ministry, which Guide
  // §7 forbids. Pinned by value so reverting to the old vocabulary is a deliberate act.
  it('names the reading bands as work to do, not as verdicts', () => {
    expect(BAND_NAME).toEqual({
      severe: 'Priority',
      broken: 'Constraint',
      watch: 'Maturing',
      holding: 'Strength',
    });
  });

  it('keeps style_spine and the copy layer on the same punctuation rule', async () => {
    const m = await loadMethodology();
    expect(m.report.style_spine).toContain('No em-dashes');
  });
});
