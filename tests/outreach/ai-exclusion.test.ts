import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');

/**
 * The clustering task (plan 2) and its gate, plus the section composer (plan 3) and its gate,
 * are the ONLY files under lib/ai/** allowed to touch reflection text or verbatims. Everything
 * else in the tree is still forbidden from both, and that half of the rule is what keeps this
 * test non-vacuous: it constrains every file that exists today.
 *
 * `verbatim` is guarded alongside `reflection` on purpose. A section composer could pull
 * theme verbatims out of the facts pack without ever writing the word "reflection" — spec
 * line 72 routes verbatims facts -> S8 renderer exclusively, never into a composer input.
 */
// Basenames, NOT lib/ai-prefixed paths: readdirSync('lib/ai', {recursive:true}) yields entries
// relative to lib/ai. That relativity is the point — a nested `sub/sections.ts` yields
// 'sub/sections.ts' and cannot inherit the exemption from a bare 'sections.ts'.
//
// sections.ts and section-gates.ts join the list per the plan-3 addendum §3. Their inputs are
// the facts pack only, and the facts-slice selectors PICK {label, gloss, support_count,
// item_ids} rather than omitting verbatims — so neither file names the guarded concepts today.
// The exemption therefore removes a guard without either file using it, which is why the
// positive assertions at the foot of this file are its replacement: they pin that the slice is
// built by picking, and that nothing but themes.ts talks to the model.
const ALLOWED = ['themes.ts', 'theme-gates.ts', 'sections.ts', 'section-gates.ts'];

const files = readdirSync('lib/ai', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

const guarded = files.filter((f) => !ALLOWED.includes(f));

describe('reflections and verbatims reach only the clustering task and its gate', () => {
  it('finds the ai module', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('the allowlist names only the clustering task and its gate', () => {
    // Pinned by value, not by length: widening the boundary must be a deliberate edit to
    // this line, visible in review, rather than a quiet append somewhere else in the file.
    expect(ALLOWED).toEqual(['themes.ts', 'theme-gates.ts', 'sections.ts', 'section-gates.ts']);
  });

  it('there is at least one guarded file left to check', () => {
    // Without this, allowlisting every file would make the scan below vacuously pass.
    expect(guarded.length).toBeGreaterThan(0);
  });

  it.each(guarded)('%s references neither reflection, verbatim nor outreachVoices', (file) => {
    // Lowercased so a PascalCase/camelCase identifier (OutreachVoicesGroup, initialReflections,
    // rawReflection, VerbatimCandidate, ...) cannot dodge a case-sensitive substring check —
    // those are exactly the casings this codebase actually uses for the concepts excluded here.
    const src = stripTs(readFileSync(`lib/ai/${file}`, 'utf8')).toLowerCase();
    expect(src).not.toContain('reflection');
    expect(src).not.toContain('verbatim');
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

/**
 * The positive half of the rewritten contract (plan 2, Task 7). Task 2's allowlist is the
 * negative half: reflections and verbatims reach no file but these two. This block checks how
 * those two files use them — spec lines 104-110, the anonymity model.
 *
 * Source-text assertions rather than behavioural ones on purpose: the behaviour is already
 * covered by tests/ai/themes-generate.test.ts, but a *reviewer* reading a diff needs a
 * tripwire that fires on the shape of the edit, not only on its runtime effect.
 */
describe('the clustering task transmits the projection, not the rows', () => {
  const themesSrc = stripTs(readFileSync('lib/ai/themes.ts', 'utf8'));
  const gatesSrc = stripTs(readFileSync('lib/ai/theme-gates.ts', 'utf8'));

  it('serializes the indexed projection and never the raw rows', () => {
    // ReflectionRow carries respondent_key; IndexedReflection structurally cannot. Swapping
    // which one is serialized is the single edit that would put identity in a model payload.
    expect(themesSrc).toContain('JSON.stringify(indexed');
    expect(themesSrc).not.toContain('JSON.stringify(rows');
  });

  it('names no respondent field anywhere in the model input construction', () => {
    // Scoped to the `input:` array, not the whole file: ReflectionRow's own declaration
    // legitimately names respondent_key, and a file-wide ban would forbid the type itself.
    const start = themesSrc.indexOf('input: [');
    expect(start).toBeGreaterThan(-1);
    const end = themesSrc.indexOf('text: {', start);
    expect(end).toBeGreaterThan(start);
    const inputBlock = themesSrc.slice(start, end);
    expect(inputBlock).not.toContain('respondent_key');
    expect(inputBlock).not.toContain('respondent_label');
    // The label list is a GATE input. Sending it — even as "avoid these names" — would put
    // every respondent's name in the prompt to protect them from being named.
    expect(inputBlock).not.toContain('labels');
  });

  it('keeps the gate off the wire — only themes.ts talks to the model', () => {
    // theme-gates.ts legitimately holds raw reflection text (sourceTexts) to substring-verify
    // verbatims. It must never transmit it: exactly one file in this tree calls the API.
    expect(gatesSrc.toLowerCase()).not.toContain('openai');
    expect(gatesSrc).not.toContain('responses.parse');
  });
});
