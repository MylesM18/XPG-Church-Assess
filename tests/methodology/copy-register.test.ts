import { describe, expect, it } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';

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
    ].filter(([, s]) => /[—–]/.test(s));
    expect(offenders.map(([path]) => path)).toEqual([]);
  });

  it('keeps style_spine and the copy layer on the same punctuation rule', async () => {
    const m = await loadMethodology();
    expect(m.report.style_spine).toContain('No em-dashes');
  });
});
