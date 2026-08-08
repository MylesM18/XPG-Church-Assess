import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000200_rpc_submit_self_response_reflection.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000200 submit_self_response reflection', () => {
  it('replaces the function in place (same signature, no drop)', () => {
    expect(body).toContain('create or replace function public.submit_self_response');
    expect(body).not.toContain('drop function');
  });

  it('rejects reflections longer than 2000 characters', () => {
    expect(body).toContain("char_length(btrim(a->>'reflection')) > 2000");
    expect(body).toContain('raise exception');
  });

  it('normalises empty reflections to NULL on insert', () => {
    expect(body).toContain("nullif(btrim(a->>'reflection'), '')");
  });

  it('overwrites reflection alongside value on re-answer', () => {
    expect(body).toContain('reflection = excluded.reflection');
    expect(body).toContain('value = excluded.value');
  });

  it('keeps the deadline lock and the in_progress gate', () => {
    expect(body).toContain('assessment_deadline_at');
    expect(body).toContain('in_progress');
  });

  it('length guard runs before the insert', () => {
    expect(body.indexOf("char_length(btrim(a->>'reflection'))")).toBeLessThan(
      body.indexOf('insert into public.responses'),
    );
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
    expect(body).toContain('to authenticated');
  });
});
