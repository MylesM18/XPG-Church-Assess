import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000300_rpc_get_my_category_answers_reflection.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000300 get_my_category_answers reflection', () => {
  it('drops before recreating (42P13: return type cannot change in place)', () => {
    expect(body).toContain('drop function if exists public.get_my_category_answers(uuid, text)');
    expect(body).toContain('create function public.get_my_category_answers');
    // Presence guards: indexOf(a) < indexOf(b) is vacuously true if `a` is absent
    // (-1 < anything). The two toContain checks above already force both to be
    // present, but assert it explicitly so the ordering check can't go vacuous if
    // this test is ever edited or reordered.
    expect(body.indexOf('drop function')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('create function')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('drop function')).toBeLessThan(body.indexOf('create function'));
    // Pin the recreated signature exactly (name, arg names, arg types) so a
    // hand-transcription slip — renamed/retyped/reordered args — is caught even
    // though the prefix check above would still pass.
    expect(body).toContain(
      'create function public.get_my_category_answers(p_church_id uuid, p_category_id text)',
    );
  });

  it('returns reflection alongside item_id and value', () => {
    expect(body).toContain('item_id text');
    expect(body).toContain('value int');
    expect(body).toContain('reflection text');
    expect(body).toContain('r.reflection');
    // Pin the full returns-table list and select list so a mutation that adds an
    // unwanted extra column, drops one, or reorders them is caught — the loose
    // substring checks above would all still pass on a reordered/padded list.
    expect(body).toContain('returns table(item_id text, value int, reflection text)');
    expect(body).toContain('select r.item_id, r.value, r.reflection');
  });

  it('keeps the caller scoping (own member responses, this category)', () => {
    expect(body).toContain("respondent_kind = 'member'");
    expect(body).toContain('respondent_user_id');
    expect(body).toContain('category_id = p_category_id');
    // Pin the exact scoping predicates. The bare 'respondent_user_id' check above
    // would still pass if this were weakened to e.g. `respondent_user_id is not
    // null` (which would leak every member's answers to every caller instead of
    // just the caller's own) — a real cross-member data leak that substring-only
    // matching would miss. Same logic for run scoping: bare presence doesn't
    // confirm the query is still scoped to the current run.
    expect(body).toContain('r.respondent_user_id = v_uid');
    expect(body).toContain('r.run_id = v_run_id');
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
    expect(body).toContain('to authenticated');
    // Pin the exact typed signature on both revoke and grant. A widened or
    // narrowed signature (extra/missing/retyped arg) is a real regression class
    // that the generic 'grant execute' / 'to authenticated' checks above cannot
    // detect on their own.
    expect(body).toContain(
      'revoke all on function public.get_my_category_answers(uuid, text) from public, anon',
    );
    expect(body).toContain(
      'grant execute on function public.get_my_category_answers(uuid, text) to authenticated',
    );
  });

  it('preserves the auth and membership guards character-identically', () => {
    // The brief requires the auth check, membership check, current_run
    // resolution, and where clause to stay character-identical. None of the
    // tests above touch the top-of-function guards at all, so a mutation that
    // deleted the "not authenticated" or "not a member of this church" raise
    // (e.g. a bad copy-paste while hand-transcribing the drop+recreate) would
    // slip through every other assertion in this file undetected.
    expect(body).toContain("raise exception 'not authenticated'");
    expect(body).toContain("raise exception 'not a member of this church'");
    expect(body).toContain('select id into v_run_id from public.current_run(p_church_id)');
  });
});
