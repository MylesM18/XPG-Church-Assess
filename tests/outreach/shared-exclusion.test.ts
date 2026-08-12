import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Comments explain WHY reflections are excluded; strip them so the prose
// cannot satisfy an absence assertion.
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');
const stripSql = (s: string) => s.replace(/--[^\n]*$/gm, '');

const sharedSql = stripSql(
  readFileSync(
    'supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql',
    'utf8',
  ),
);
const sharedPage = stripTs(readFileSync('app/r/[shareToken]/page.tsx', 'utf8'));

describe('the shared report surface never carries reflections', () => {
  it('layer 1 — SQL returns no reflection, but does return the run version', () => {
    expect(sharedSql).not.toContain('reflection');
    expect(sharedSql).toContain('methodology_version');
  });

  it('layer 2 — the shared row type has no reflection field', () => {
    // The page's ONLY legitimate mention of `reflection` is the mandated empty literal
    // passed to assembleFallbackOnly — the structural exclusion itself. Remove exactly
    // that, then require the rest of the file to be clean. Counting rather than
    // substring-absence is deliberate: a bare not.toContain('reflection') breaks on the
    // MORE explicit code, which would push the next author toward an implicit omission.
    const EXCLUSION_LITERAL = /reflections:\s*\[\s*\]/g;
    const occurrences = sharedPage.match(EXCLUSION_LITERAL) ?? [];
    expect(
      occurrences.length,
      'the shared page must pass exactly one explicit `reflections: []` literal',
    ).toBe(1);
    expect(sharedPage.replace(EXCLUSION_LITERAL, '')).not.toContain('reflection');
  });

  it('layer 3 — the shared page builds its sections from the fallback-only assembler', () => {
    // Replaces the old `audience: 'shared'` anchor, which died with resolveReportView.
    // assembleFallbackOnly is the new structural guarantee: it has no AI path and no
    // persisted-row parameter at all, so the public surface cannot render model output
    // or read the reports table even by mistake.
    expect(sharedPage).toContain('assembleFallbackOnly(');
    expect(sharedPage).not.toContain('assembleReport(');
    expect(sharedPage).not.toContain(".from('reports')");
  });

  it('the shared page does read the run version for derive', () => {
    expect(sharedPage).toContain('methodology_version');
  });
});

describe('the shared report surface passes the literal redacted label source (D-P4-4)', () => {
  it('never calls knownLabels(...) — the literal { kind: \'redacted\' } is required, not derived', () => {
    // D-P4-4 (locked decision): the shared page must pass `labelSource: { kind: 'redacted' }`
    // as a LITERAL, never `knownLabels(responses)`. That call would type-check and look like
    // a reasonable "use the real thing" refactor — `responses` here genuinely does carry a
    // `respondent_label` field (redacted to '' by get_shared_run_responses, but present).
    //
    // The observable difference TODAY is ZERO: churchFactsFrom(null, …) returns every profile
    // column as null, and buildFacts's free-text loop is gated on `labelSource.kind === 'known'`
    // AND short-circuits per-field on a null column before it ever reaches
    // containsRespondentLabel — so facts.profile is `{}` either way. No test can observe a
    // behavioural regression from this swap right now, which is exactly why nothing else in
    // the suite catches it.
    //
    // The reason this still matters is fail-closed PERMANENCE for plan 5: `knownLabels(responses)`
    // here yields `{ kind: 'known', labels: [] }` (every label is redacted to ''), which looks
    // IDENTICAL to "this run genuinely has no nameable respondents" and passes every current
    // test. The moment plan 5 gives this page a real profile, that literal would silently
    // unguard every free-text field — the redacted variant is the only spelling that fails
    // closed by construction, because FREE_TEXT_PROFILE_KEYS are only ever considered under
    // `kind === 'known'`.
    expect(
      /kind:\s*'redacted'/.test(sharedPage),
      "the shared page must pass the literal `labelSource: { kind: 'redacted' }` (D-P4-4)",
    ).toBe(true);
    expect(
      sharedPage.includes('knownLabels('),
      'the shared page must never call knownLabels(...) for its labelSource — even though ' +
        '`responses` carries a respondent_label field and knownLabels(responses) would ' +
        'type-check, it silently trades a permanent fail-closed guard for a data-shaped one ' +
        'that is accidentally safe today and unsafe the moment this page gains a real profile.',
    ).toBe(false);
  });
});
