-- Outreach questions (methodology 0.3.0): optional free-text reflection per response.
-- Nullable — every existing row keeps NULL, and reflections stay optional forever.
-- The CHECK mirrors the app-layer limit (lib/answers/validate.ts) and the RPC guard
-- in 20260807000200: empty/whitespace-only text is normalised to NULL before it lands,
-- so a stored reflection is always 1..2000 real characters.

alter table public.responses
  add column if not exists reflection text
  check (reflection is null or char_length(reflection) between 1 and 2000);
