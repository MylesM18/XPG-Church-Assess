import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');

const files = readdirSync('lib/ai', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

describe('AI prose never reads reflections', () => {
  it('finds the ai module', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s references neither reflection nor outreachVoices, case-insensitively', (file) => {
    // Lowercased so a PascalCase/camelCase identifier (OutreachVoicesGroup, initialReflections,
    // rawReflection, ...) cannot dodge a case-sensitive substring check — those are exactly the
    // casings this codebase actually uses for the concepts being excluded here.
    const src = stripTs(readFileSync(`lib/ai/${file}`, 'utf8')).toLowerCase();
    expect(src).not.toContain('reflection');
    expect(src).not.toContain('outreachvoices');
  });
});

// The scan above only proves lib/ai/ itself never mentions reflections. That is not the whole
// story: lib/ai/prose.ts's generateProse takes a plain Diagnosis object and JSON.stringifies it
// whole into the model prompt, so it would carry reflections through with zero bytes changed
// under lib/ai/ if they ever reached that Diagnosis object. The actual protection is upstream,
// in app/app/[churchId]/actions.ts: an explicit field-by-field allowlist between the raw DB row
// (which DOES legitimately carry `.reflection` — RunResponseRow declares it) and the Response[]
// that becomes the Diagnosis passed to generateProse. Nothing else in the repo pins that seam.
// (Bracket path — a git command naming this file needs GIT_LITERAL_PATHSPECS=1; irrelevant to
// reading it here via node:fs.)
const actionsSource = stripTs(readFileSync('app/app/[churchId]/actions.ts', 'utf8'));

/**
 * Captures the object-literal body of `(raw ?? []).map((r: RunResponseRow) => ({ ... }))`.
 * Anchored on the map's parameter type so the RunResponseRow interface's own, legitimate
 * `reflection: string | null` field declaration (elsewhere in this file) cannot satisfy or
 * break this match — only the destination object literal actually built from `r` is inspected.
 */
function mapBody(source: string): string | null {
  const re = /\.map\(\(r:\s*RunResponseRow\)\s*=>\s*\(\{([\s\S]*?)\}\)\)/;
  const match = re.exec(source);
  return match ? match[1]! : null;
}

describe('the raw-row to Response[] mapping stays an explicit allowlist that drops reflection', () => {
  it('the map body is found', () => {
    expect(
      mapBody(actionsSource),
      'expected (raw ?? []).map((r: RunResponseRow) => ({ ... })) in app/app/[churchId]/actions.ts',
    ).not.toBeNull();
  });

  it('the mapping does not spread the raw row', () => {
    // A spread (...r) would silently carry r.reflection into Response[], and from there into
    // the Diagnosis object generateProse JSON.stringifies whole — the explicit field-by-field
    // allowlist is the only thing preventing that today. This is the "enrich the prompt with
    // member quotes" edit the whole file exists to catch, in its least conspicuous form: no
    // occurrence of the word "reflection" anywhere near the change.
    expect(mapBody(actionsSource)).not.toMatch(/\.\.\.\s*r\b/);
  });

  it('the mapping does not reference reflection', () => {
    // Independent of the spread check: catches an explicit `reflection: r.reflection` key
    // added to the allowlist, which a spread-only check would not.
    expect(mapBody(actionsSource)).not.toContain('reflection');
  });
});

describe('the generateProse call site passes the clean diagnosis, not an enriched one', () => {
  it('generateProse is called with exactly (diagnosis, derived.effectiveMethodology)', () => {
    // A positive structural pin, not a substring check: any change to this call site — a
    // spread, an extra argument, a different variable — breaks the match. Strict-equal on the
    // two argument expressions, whitespace-tolerant so a pure reformat doesn't false-fail.
    expect(actionsSource).toMatch(/generateProse\(\s*diagnosis\s*,\s*derived\.effectiveMethodology\s*,?\s*\)/);
  });
});
