import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILE =
  'supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql';
const sql = readFileSync(FILE, 'utf8');
// Strip line comments: the header explains WHY reflection is absent, and that
// explanation must not satisfy the absence assertion below.
const body = sql.replace(/--[^\n]*$/gm, '');

// Asserts every needle is present, in order, by searching each one starting
// just after the previous match. This both guards presence (indexOf returns
// -1 -> fails loudly) AND guards ordering — unlike a bare
// `indexOf(a) < indexOf(b)`, which is vacuously true whenever `a` is absent
// (-1 < anything), and unlike a naive from-the-start indexOf per needle,
// which can mis-order on any needle (e.g. a bare ')') that also occurs
// earlier in the file for an unrelated reason.
function expectInOrder(haystack: string, needles: string[]) {
  let previousIndex = -1;
  let previousNeedle = '<start of file>';
  for (const needle of needles) {
    const index = haystack.indexOf(needle, previousIndex + 1);
    expect(
      index,
      `expected to find ${JSON.stringify(needle)} after ${JSON.stringify(previousNeedle)}`,
    ).toBeGreaterThanOrEqual(0);
    previousIndex = index;
    previousNeedle = needle;
  }
}

describe('20260807000600 get_shared_run_responses methodology_version', () => {
  it('drops before recreating (42P13: return type cannot change in place)', () => {
    // Pin the exact typed signature — the live function takes p_token uuid, NOT
    // the brief's placeholder `text`. Postgres DROP matches on argument TYPES,
    // not names: a wrong-typed drop silently no-ops, and the CREATE that
    // follows then fails with "already exists" on apply.
    expect(body).toContain('drop function if exists public.get_shared_run_responses(uuid)');
    expect(body).toContain('create function public.get_shared_run_responses(p_token uuid)');
    expectInOrder(body, [
      'drop function if exists public.get_shared_run_responses(uuid)',
      'create function public.get_shared_run_responses(p_token uuid)',
    ]);
  });

  it("returns methodology_version, read from the share's run", () => {
    expect(body).toContain('v_run public.assessment_runs;');
    expect(body).toContain(
      'select * into v_run from public.assessment_runs where id = v_share.run_id;',
    );
    // Pin the full returns-table column list AND the full select list, in
    // order. Loose substring checks alone would still pass on a reordered,
    // padded, or truncated list; this also confirms attendance_band gained a
    // trailing comma (i.e. it is no longer the last column) in both places,
    // which is itself part of the edit under test.
    expectInOrder(body, [
      'returns table(',
      'category_id text,',
      'item_id text,',
      'value int,',
      'respondent_label text,',
      'respondent_user_id uuid,',
      'attendance_band text,',
      'methodology_version text',
      ')',
    ]);
    expectInOrder(body, [
      'select r.category_id,',
      'r.item_id,',
      'r.value,',
      "''::text as respondent_label,",
      'r.respondent_user_id,',
      'v_church.attendance_band,',
      'v_run.methodology_version',
      'from public.responses r',
    ]);
  });

  it('NEVER exposes reflection on the shared surface', () => {
    // The single highest-value assertion in this feature's entire SQL layer.
    // get_shared_run_responses is the one RPC in the 20260807 chain that must
    // NOT gain the `reflection` column its three siblings
    // (get_my_category_answers, get_run_responses,
    // get_completed_run_responses) all gained in Tasks 6-7. Comments are
    // stripped above specifically so the header's own prose explaining this
    // exclusion — which necessarily contains the word "reflection" — cannot
    // accidentally satisfy this check; if the strip regex itself broke, this
    // assertion would (correctly) start failing too.
    expect(body).not.toContain('reflection');
  });

  it('keeps the token gate exactly — no oracle for revoked/expired/unknown', () => {
    expect(body).toContain('revoked');
    expect(body).toContain('expires_at');
    // Pin the complete gate predicate and its unconditional early return.
    // Losing any single clause (e.g. the expires_at check) would let a
    // revoked or expired token still resolve to real data — the highest-
    // stakes possible defect in this migration, since this path is reachable
    // by anyone with a guessed or leaked token.
    expect(body).toContain(
      'if not found or v_share.revoked or v_share.expires_at is null or v_share.expires_at < now() then',
    );
    expectInOrder(body, [
      'if not found or v_share.revoked or v_share.expires_at is null or v_share.expires_at < now() then',
      'return;',
      'end if;',
    ]);
  });

  it('keeps the label redaction and the real (non-redacted) respondent_user_id', () => {
    expect(body).toContain("''::text as respondent_label");
    // respondent_user_id must stay REAL (never redacted) per the Option B
    // contract in the original header — only the label is blanked. A
    // mutation that also redacted or dropped the user id would break
    // normalize()'s respondent keying without tripping any other assertion
    // in this file.
    expect(body).toContain('r.respondent_user_id,');
  });

  it('preserves inline run/church resolution — never current_run()', () => {
    // 20260730000100's header names get_shared_run_responses as one of
    // exactly three RPCs that must keep resolving inline; converting it to
    // current_run() (the pattern get_my_category_answers now uses) is an
    // explicit non-goal for this migration.
    expect(body).not.toContain('current_run(');
    expect(body).toContain('select * into v_share from public.report_shares where id = p_token;');
    expect(body).toContain(
      'select * into v_church from public.churches where id = v_share.church_id;',
    );
    expect(body).toContain('where r.run_id = v_share.run_id;');
  });

  it('keeps the anon + authenticated grants, revoked from public only', () => {
    expect(body).toContain('grant execute');
    expect(body).toContain('anon');
    // Pin the exact typed signature AND exact role lists on both revoke and
    // grant. This function's grant set deliberately differs from its
    // authenticated-only siblings: revoke targets `public` alone (not
    // `public, anon`, the pattern every sibling RPC in this feature uses)
    // because the very next statement grants anon back explicitly — this
    // function is reachable by an unauthenticated share-token visitor. Assert
    // that asymmetry precisely so a "helpful" alignment to the sibling
    // pattern is caught.
    expect(body).toContain(
      'revoke all on function public.get_shared_run_responses(uuid) from public;',
    );
    expect(body).toContain(
      'grant execute on function public.get_shared_run_responses(uuid) to anon, authenticated;',
    );
    expect(body).not.toContain('from public, anon');
  });

  it('preserves security definer, search_path pin, and language', () => {
    // Attribute-dropping mutations (e.g. losing `security definer`) are not
    // syntax errors — they silently change runtime behavior instead. Nothing
    // else in this file checks the function's declared attributes.
    expect(body).toContain('language plpgsql');
    expect(body).toContain('security definer set search_path = public');
  });
});
