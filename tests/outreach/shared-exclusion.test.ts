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
