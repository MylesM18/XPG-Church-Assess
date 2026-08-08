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
    expect(sharedPage).not.toContain('reflection');
  });

  it('layer 3 — the shared page passes no reflections opt to the view', () => {
    expect(sharedPage).not.toContain('reflections');
    expect(sharedPage).toContain("audience: 'shared'");
  });

  it('the shared page does read the run version for derive', () => {
    expect(sharedPage).toContain('methodology_version');
  });
});
