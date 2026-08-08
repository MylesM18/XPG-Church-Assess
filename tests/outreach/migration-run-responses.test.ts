import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// get_run_responses (in_progress) and get_completed_run_responses (complete) are
// byte-siblings (20260728000100 / 20260728000300) differing only in run status
// scope. Both gain a 6th `reflection` column here — there is no asymmetry between
// these two. The privacy asymmetry lives elsewhere: get_shared_run_responses
// (20260807000600) deliberately does NOT gain reflection — that migration and its
// own tripwire are a separate task and out of scope for this file.
const FILES: Array<[string, string, string]> = [
  ['get_run_responses', '20260807000400_rpc_get_run_responses_reflection.sql', 'in_progress'],
  [
    'get_completed_run_responses',
    '20260807000500_rpc_get_completed_run_responses_reflection.sql',
    'complete',
  ],
];

describe.each(FILES)('%s reflection migration', (fn, file, status) => {
  const body = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/--[^\n]*$/gm, '');

  it('drops before recreating (42P13: return type cannot change in place)', () => {
    expect(body).toContain(`drop function if exists public.${fn}(uuid)`);
    expect(body).toContain(`create function public.${fn}`);
    // Presence guards: indexOf(a) < indexOf(b) is vacuously true if `a` is absent
    // (-1 < anything satisfies "less than"). The toContain calls above already
    // force both substrings to be present, but assert it explicitly so the
    // ordering check below can never go vacuous if this test is edited later.
    expect(body.indexOf('drop function')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('create function')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('drop function')).toBeLessThan(body.indexOf('create function'));
    // Pin the recreated signature exactly (name + arg name + arg type) so a
    // hand-transcription slip (renamed/retyped arg) is caught even though the
    // bare prefix check above would still pass on a mangled signature.
    expect(body).toContain(`create function public.${fn}(p_church_id uuid)`);
  });

  it('returns reflection as a sixth column', () => {
    expect(body).toContain('reflection text');
    expect(body).toContain('r.reflection');
    // Pin the full returns-table list and select list, in order, so a mutation
    // that adds an unwanted extra column, drops one, or reorders them is caught —
    // the loose substring checks above would all still pass on a reordered or
    // padded list.
    expect(body).toContain(
      'returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)',
    );
    expect(body).toContain(
      'select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection',
    );
  });

  it('keeps the five original columns', () => {
    for (const col of ['category_id', 'item_id', 'value', 'respondent_label', 'respondent_user_id']) {
      expect(body, col).toContain(col);
    }
  });

  it(`keeps its run scope (${status}) and inline run resolution`, () => {
    expect(body).toContain(status);
    expect(body).not.toContain('current_run()');
    // The bare toContain(status) above is nearly vacuous for the 'complete' case:
    // the function's own NAME is get_completed_run_responses, which already
    // contains the substring 'complete', so that check alone would pass even if
    // the actual predicate below were mutated to e.g. `status <> 'in_progress'`.
    // Pin the exact scoping predicate and the oldest-first inline resolution
    // shape so a status swap or a switch to newest-first can't hide.
    expect(body).toContain(`where church_id = p_church_id and status = '${status}'`);
    expect(body).toContain('order by created_at asc');
    expect(body).toContain('limit 1');
    expect(body).toContain('where r.run_id = v_run_id');
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
    // Pin the exact typed signature on both revoke and grant. A widened or
    // narrowed signature (extra/missing/retyped arg) is a real regression class
    // that the generic 'revoke all' / 'grant execute' checks above cannot detect
    // on their own.
    expect(body).toContain(`revoke all on function public.${fn}(uuid) from public, anon`);
    expect(body).toContain(`grant execute on function public.${fn}(uuid) to authenticated`);
  });

  it('preserves the auth and membership guards character-identically', () => {
    // Nothing above touches the top-of-function guards at all — a mutation that
    // dropped the "not authenticated" or "not a member of this church" raise
    // (e.g. a bad copy-paste while hand-transcribing the drop+recreate) would
    // slip through every other assertion in this file undetected.
    expect(body).toContain("raise exception 'not authenticated' using errcode = 'insufficient_privilege'");
    expect(body).toContain(
      "raise exception 'not a member of this church' using errcode = 'insufficient_privilege'",
    );
    expect(body).toContain(
      'select 1 from public.church_members where church_id = p_church_id and user_id = v_uid',
    );
  });

  it('preserves security definer, search_path pin, and language', () => {
    // Attribute-dropping mutations (e.g. losing `security definer`) are not
    // syntax errors — they silently change runtime behavior instead. Nothing
    // else in this file checks the function's declared attributes.
    expect(body).toContain('language plpgsql');
    expect(body).toContain('security definer set search_path = public');
  });
});
