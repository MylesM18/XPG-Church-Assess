import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000100_responses_reflection_column.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000100 responses.reflection column', () => {
  it('adds the column to public.responses', () => {
    expect(body).toContain('alter table public.responses');
    expect(body).toContain('add column if not exists reflection text');
  });

  it('constrains length to 1..2000, null allowed', () => {
    expect(body).toContain('reflection is null');
    expect(body).toContain('char_length(reflection) between 1 and 2000');
  });

  it('does not drop or rewrite the table', () => {
    expect(body).not.toContain('drop table');
    expect(body).not.toContain('drop column');
  });
});
