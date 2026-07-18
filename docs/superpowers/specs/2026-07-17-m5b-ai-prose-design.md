# M5b — AI prose rewrite of the diagnosis report (design spec)

- **Date:** 2026-07-17
- **Milestone:** M5b (third of four M5 sub-projects; build order M5a → M5d → **M5b** → M5c)
- **Branch (when build starts):** `feat/m5b-ai-prose` off `master` (`329c16b`)
- **Status:** design approved (brainstorm Q1–Q3 + design Sections 1–8 locked); this spec is the writing-plans input.
- **Baseline gate floors (do not regress):** tsc 0 · eslint 0 · vitest **129** · pgTAP Files=**15** Tests=**144**.

## 1. Goal

M5a shipped a diagnosis report at `/app/[churchId]/diagnosis` that renders **deterministically** from `fallbackProse()`. M5b makes the report *read* like a person wrote it — warm, plain, precise — **without letting the AI decide anything**. The AI only **rewords** a fixed, already-computed draft; every number, category, verdict, and offer is fixed by the deterministic engine before the model ever sees it.

The report page (`diagnosis/page.tsx`) is **not touched**: M5a already wired the `PROSE_MODE` gate that reads persisted `prose` when present and falls back to `fallbackProse()` otherwise. M5b's job is to *populate* that `prose` column.

M5b is **additive**: a new AI module, a new Zod schema, one new SECURITY DEFINER RPC, a ~15-line isolated block inside the existing `generateDiagnosis` server action, tests, and env docs. Nothing existing is rewritten.

### Non-goals (explicitly out of scope for M5b)

- **`classify.ts` / free-text classification (deferred, Q1).** No free-text is collected anywhere — every answer is an integer 1–10 (`lib/answers/validate.ts`, `AnswerInput = {item_id, value: 1..10}`). The `text:` fields in `methodology/questions.yaml` are question *prompts*, not responses. Classify has zero input today; defer until free-text questions exist.
- **Touching the report page** (`app/app/[churchId]/diagnosis/page.tsx`) — its `PROSE_MODE` read gate already exists from M5a and is correct.
- **A user-visible "regenerate prose" button, streaming, or a settings UI.** Prose is generated eagerly and silently as a side effect of generating the diagnosis.
- **Making the AI output deterministic.** Determinism lives at the caching layer (`response_hash`), not the token layer.

## 2. The three prime directives (non-negotiable)

1. **The report never depends on AI.** It renders fully with `PROSE_MODE=fallback` (AI call skipped) **and** with `prose = null` (page recomputes `fallbackProse()` live). Two independent guarantees.
2. **AI only rewords; it decides nothing.** It never originates or alters a number, verdict, primary constraint, downstream list, or offer. Enforced structurally (draft-reword framing + `passesFactCheck`), not by trusting the prompt.
3. **The API key stays server-side.** `@anthropic-ai/sdk` is imported and called only inside the server action (server context). `ANTHROPIC_API_KEY` is never referenced in client code.

## 3. Locked decisions (from brainstorm Q1–Q3)

- **Q1 Scope = PROSE-ONLY.** Build `lib/ai/prose.ts` only; skip `classify.ts`.
- **Q2 Trigger = EAGER,** inside `generateDiagnosis` after `save_diagnosis` succeeds. The report page only *reads* cached prose. (Rejected: lazy-at-view, explicit button.)
- **Q3 Guardrail = SHAPE + NUMERIC/CATEGORY POST-CHECK.** Zod shape-validation via structured outputs, then a deterministic post-check: every number in the AI prose ⊆ an allowed set; the primary category name still appears; field set is unchanged. Else discard → `null` → fallback. (Rejected: shape-only, too weak; strict no-numbers, breaks the contract where numbers are baked into sentences.)

## 4. Architecture & data flow

All new/changed surfaces:

| Surface | Type | Purpose |
|---|---|---|
| `lib/ai/prose.ts` | new module | `generateProse(d, methodology) → Promise<ReportBlocks \| null>`; also exports pure `passesFactCheck` + `ReportBlocksSchema` |
| `ReportBlocksSchema` | new Zod schema | mirrors the 9-field `ReportBlocks`; drives `zodOutputFormat` **and** validates the parse |
| `supabase/migrations/<ts>_rpc_save_prose.sql` | new migration | `save_prose` SECURITY DEFINER RPC (diagnoses RLS is SELECT-only for members) |
| `generateDiagnosis` (`app/app/[churchId]/actions.ts`) | ~15-line isolated block after `:106` | cache-check → generateProse → save_prose, all in `try/catch` |
| `package.json` | dep add | `@anthropic-ai/sdk` |
| `.env.example` / env docs | config | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_PROSE`, `PROSE_MODE` |

Data flow (`generateDiagnosis`, additive block only shown):

```
… existing through :106:
  diagnose() → diagnosis            (lib/engine)
  responseHash() → hash             (lib/report/response-hash)
  rpc save_diagnosis(...)           inserts diagnoses row (prose=null), flips run → complete

NEW block  (between :106 and the existing revalidatePath at :108):
  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  if (PROSE_MODE !== 'fallback') {
    try {
      // cache-check (array-tolerant, never throws) — RLS permits member SELECT
      const { data: rows } = await supabase
        .from('diagnoses').select('prose_source').eq('response_hash', hash)
      const alreadyAi = (rows ?? []).some(r => r.prose_source === 'ai')
      if (!alreadyAi) {
        const blocks = await generateProse(diagnosis, methodology)   // never throws → ReportBlocks | null
        if (blocks) {
          await supabase.rpc('save_prose', {
            p_church_id: churchId, p_response_hash: hash, p_prose: blocks, p_prose_source: 'ai',
          })
        }
      }
    } catch { /* prose is best-effort; must never break the saved diagnosis or the redirect */ }
  }

… existing UNCHANGED, OUTSIDE the try:
  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  redirect(`/app/${churchId}/diagnosis`)
```

**Key design idea (the spine of directive #2):** `generateProse` first computes the deterministic `fallbackProse(d, methodology)` **draft**, then feeds *that draft* to the model as the content to reword — not the raw `Diagnosis` struct. The model rewrites wording only and returns the same JSON shape. Consequences:

- The model never derives a number — there is nothing to invent; every number is already in the draft.
- The post-check's "allowed set" falls out of the draft naturally.
- Both `ReportBlocks` branches (3-field null-constraint vs. full 9-field) are handled automatically, because the draft *is* one of those shapes.

The `Diagnosis` struct is passed alongside the draft as ground-truth grounding; the post-check is the hard backstop that does not trust the model.

**In-scope variables at the insertion point** (verified in `actions.ts`): `supabase`, `churchId`, `methodology`, `diagnosis`, `hash`. `redirect()` (`:110`) is already outside any try/catch. Next implements `redirect()` by throwing a sentinel the framework catches — the prose `try/catch` must sit strictly *before* `revalidatePath`/`redirect` so it can never swallow that sentinel.

## 5. `generateProse` contract

```ts
export async function generateProse(
  d: Diagnosis,
  methodology: Methodology,
): Promise<ReportBlocks | null>
// null ⇒ caller falls back (does nothing; page recomputes fallbackProse live).
// NEVER throws: SDK/network error, schema-validation failure, and post-check
// failure all resolve to null.
```

No classify param (Q1). Internal steps:

1. `const draft = fallbackProse(d, methodology)` — the deterministic ground truth.
2. `client.messages.parse({ model, max_tokens, messages, /* structured output via zodOutputFormat(ReportBlocksSchema) */ })`
   - Model from `ANTHROPIC_MODEL_PROSE` (default `claude-sonnet-5`); key from `ANTHROPIC_API_KEY`, server-only.
   - **No `temperature` / `top_p`** (Sonnet-5 caveat — omit both).
   - ~15s timeout (AbortController/signal or SDK request-timeout option), **no retry**.
3. Read `message.parsed_output` (the schema-validated `ReportBlocks`) → run `passesFactCheck`.
4. Pass → return the `ReportBlocks`. Fail (or any thrown error caught internally) → `null`.

**System prompt** = the reword framing (verbatim intent):

> You are given a fixed set of facts as a draft report in JSON. You may not add, change, reorder, or invent any number, category, or verdict. Rewrite only the wording of each field. Write in this register: plain words, warm but precise. No em-dashes. No churchy clichés. Sentence case. Active voice. Name things the way a church leader would. If a fact is absent from the struct, do not supply it. Return the same JSON block shape you were given — the same fields, no fields added or dropped. Return only the JSON.

**User message** = the draft JSON (content to reword) + the serialized `Diagnosis` struct (grounding).

`ReportBlocksSchema` (Zod) mirrors the shipped 9-field interface exactly:

```ts
// required: verdict, next_step, benchmark_note
// optional: evidence, blind_spot, cost, do_not_work_on, gating, dispersion
```

> **Plan-time lock (Context7, `/anthropics/anthropic-sdk-typescript`):** confirm the exact optional-field encoding `zodOutputFormat` requires for structured outputs (optional vs. `.nullable()` vs. `.nullish()`), the import path (`@anthropic-ai/sdk/helpers/zod`), the `messages.parse` call shape, and where `parsed_output` lands. The field-parity post-check invariant (Section 6) holds regardless of which encoding is chosen. Pin the SDK version at plan time.

## 6. The post-check — `passesFactCheck` (Q3 guardrail)

Pure function, no I/O, unit-testable, exported so tests need no mock:

```ts
export function passesFactCheck(
  ai: ReportBlocks,
  draft: ReportBlocks,
  d: Diagnosis,
  methodology: Methodology,
): boolean
```

Any failing check ⇒ `generateProse` returns `null`. Four checks:

1. **Field parity.** The set of *populated* fields in `ai` must equal the set of populated fields in `draft` (populated = present and non-empty after trim). Catches dropped facts **and** invented sections. Makes the null-constraint branch safe: if the draft had only `{verdict, next_step, benchmark_note}`, the AI output must too.
2. **Numeric containment.** Checked **per field**, not against one global allowed set: for each field, the numeric tokens in `ai[field]` must be a subset of the numeric tokens in that same field's `draft[field]` text. Extraction: regex over ints and decimals including `%` and thousands separators; normalize by numeric value (`parseFloat` after stripping `%` and `,`), so `45` ≡ `45.0`, `45%` → `45`; membership is by **value, not count**. Rule: every numeric token in an AI field must be in that field's own draft allowed set, else fail. (The draft already contains every legitimate number for its own field — `primary_score` in `verdict`, evidence-trail `ref value` pairs in `evidence`, blind-spot `belief/evidence/gap` in `blind_spot`, dispersion `spread` in `dispersion`, and the fixed `benchmark_note` copy — because the draft *is* `fallbackProse`'s output. A global allowed set unioned across the whole draft, or worse the serialized `Diagnosis` struct, was tried and rejected: the struct densely covers 0-100 with every category score, percentile, and evidence value, so a reword that migrates a number from one field — or a different category's score entirely — into a field it doesn't belong in would pass. A faithful reword never moves a number across fields, so per-field scoping narrows that hole considerably — but on its own it does not close it: `verdict`'s own draft text legitimately contains *both* the real score and the fixed scale literal `100` (`"scored {primary_score} out of 100"`), so a reword that reattaches `100` to the score's noun phrase stays within that field's allowed set. Check 4 narrows that further — to rewords that retain the true score *alongside* a misattributed one — but does not close it either, since it tests for presence, not exclusivity. See the stated limitation below.)
3. **Category fidelity.** If `d.primary_constraint` is non-null, the primary category name (`nameOf(primary_constraint.category_id)`, case-insensitive substring match) must appear in the AI prose. Absent ⇒ the model renamed or substituted the constraint ⇒ fail. If `primary_constraint` is null, skip this check (field-parity already pins the 3-field shape).
4. **Primary-score pin.** Symmetric with (3). If `d.primary_constraint` is non-null, the primary category's actual `score` (from `d.categories`) must appear among the numeric tokens of `ai.verdict`. Catches the case (2) cannot: a reword that keeps every number "in field" but attaches the wrong one — e.g. the scale `100` — to the headline "scored ___" phrase. Skipped (not failed) when there is no primary constraint, or in the defensive case its category is absent from `d.categories`.

**Stated limitation (accepted).** Numeric containment is a *containment guard, not a proof*: an invented number that happens to equal an allowed value **within the same field** passes. Mitigated by the system-prompt ban and the reword framing (the model is handed the finished numbers, not asked to compute any). It is a backstop, not a theorem — documented here so no one mistakes it for one.

## 7. `save_prose` RPC

New migration `supabase/migrations/<ts>_rpc_save_prose.sql` — **RPC only, no schema change.** The `diagnoses` columns `prose jsonb`, `prose_source text check (prose_source in ('ai','fallback'))`, and `generated_at timestamptz default now()` already exist (verified `20260715000100_schema.sql:74-85`); both prose fields nullable; `unique (run_id, response_hash)`.

```sql
create function public.save_prose(
  p_church_id uuid,
  p_response_hash text,
  p_prose jsonb,
  p_prose_source text default 'ai'
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  n int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  update public.diagnoses dg
     set prose = p_prose, prose_source = p_prose_source, generated_at = now()
    from public.assessment_runs ar
   where dg.run_id = ar.id
     and ar.church_id = p_church_id
     and dg.response_hash = p_response_hash;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no diagnosis found to attach prose to';
  end if;
end;
$$;

revoke all on function public.save_prose(uuid, text, jsonb, text) from public, anon;
grant execute on function public.save_prose(uuid, text, jsonb, text) to authenticated;
```

Design notes:

- **Admin gate** identical to `save_diagnosis` (`20260716001100_rpc_save_diagnosis.sql`): `auth.uid()` + `church_members` admin check, raising `insufficient_privilege`.
- **The one difference from `save_diagnosis`:** by the time prose runs, `save_diagnosis` has already flipped the run to `complete`, so `save_prose` must **not** filter on `status = 'in_progress'`. It locates the row by joining church → run → hash.
- **0-row guard** turns a silent miss (wrong hash / wrong church) into a loud failure the caller's `try/catch` swallows.
- **Idempotent:** it is an UPDATE — re-running the same args is a no-op; a genuine regenerate safely overwrites.
- **`generated_at = now()` bump** keeps this row the newest for its run, which is exactly how the report selects the diagnosis to display (`page.tsx:52`, `order('generated_at', desc).limit(1)`). Consistent.
- **Accepted edge case:** the join is by `(church_id, response_hash)`, not `(run_id, response_hash)`. A church with two runs of *identical* answers (same hash) would have the UPDATE touch both rows. This is harmless — same hash ⇒ same diagnosis payload ⇒ the same content is being reworded — and idempotent. The app is effectively single-run per church today (both `save_diagnosis` and `page.tsx` scope to the earliest run), so this is a theoretical case, documented, not specially handled.
- `p_prose_source` defaults `'ai'`; the param exists so a caller *could* record a `'fallback'` outcome, but Section 8 declines to (do-nothing-on-failure).

## 8. `generateDiagnosis` wiring & failure policy

The isolated block from Section 4, with these deliberate choices:

- **Gate = `(process.env.PROSE_MODE ?? 'fallback') !== 'fallback'`.** This matches the report page's gate *exactly* (`page.tsx:64`), so `PROSE_MODE` unset ⇒ fallback ⇒ prose neither generated nor displayed. No wasted API call in unset mode. Setting `PROSE_MODE=ai` (or any non-`fallback` value) turns generation **and** display on together.
- **Cache-check = array-tolerant direct SELECT.** `.select('prose_source').eq('response_hash', hash)` → `rows.some(r => r.prose_source === 'ai')`. RLS permits member SELECT on `diagnoses`, and an admin is a member, so no RPC is needed. Array form (not `.maybeSingle()`) tolerates the rare multi-row hash case (Section 7 edge) without throwing. We regenerate only when no `'ai'` row exists for the hash; since the hash changes iff the answer set changes, resubmitting identical answers is a no-op.
- **Failure-path = do nothing.** If `generateProse` returns `null`, we simply don't call `save_prose`. `prose` stays `null`, and the report recomputes `fallbackProse` live — zero drift, smallest surface, honors directive #1. We deliberately do **not** write a `'fallback'` marker row: that would force the cache-check to distinguish "failed, don't retry" from "not tried yet," adding state for little gain. (If observability is ever wanted, it's a one-line `save_prose(hash, null, 'fallback')` add, at which point the cache-check's `'ai'`-only test already does the right thing — a later regenerate re-attempts AI.)
- **Whole block in `try/catch`.** The diagnosis is committed *before* this block, so no thrown SDK/network/RPC error can break the saved diagnosis or the redirect.

**Eager-mode cost (accepted, Q2):** the admin who triggers generation waits the AI latency (~a few seconds, capped ~15s) before the redirect fires. That is the accepted trade for a report that is already AI-worded on first view.

## 9. Error handling & determinism (summary of invariants)

- **Silent auto-fallback:** no user-visible prose error exists. Every failure resolves to `null` inside `generateProse` and to "do nothing" in the caller. `prose_source` on the row is the only record of which path ran.
- **Determinism via `response_hash`:** prose is (re)generated only when the response set changes (new hash). Identical answers → same hash → cache hit → stable stored prose. Wording may differ across two genuinely different runs; that is fine.
- **Latency:** one shot, ~15s timeout, no retry.

## 10. Config / env

| Var | Value / default | Scope | Role |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | (secret) | **server only** | SDK auth; never in client code |
| `ANTHROPIC_MODEL_PROSE` | `claude-sonnet-5` | server | model id read at call time, not hard-coded |
| `PROSE_MODE` | `ai` \| `fallback` (unset ⇒ treated as `fallback`) | server | kill-switch; `fallback` (or unset) skips the AI call entirely |

- Model string from env, never a literal. Default verified against Anthropic docs at plan time before committing.
- `.env.example` / env docs only — no real secrets to git.
- Add `@anthropic-ai/sdk` to `package.json` dependencies (currently absent; only `zod 3.23.8` present). Version pinned at plan time.
- Quick grep at implementation time to confirm no client component imports `lib/ai/prose.ts` (an accidental client import would both leak the key path and break the build).

## 11. Testing

Layer new coverage on top of the floors (vitest 129 → add; pgTAP Files=15 Tests=144 → add). Every SDD task still runs the full gate (`typecheck` / `lint` / `test` / `test:db` / `build`).

**vitest — `passesFactCheck` (pure, no mock):**

| Fixture | Expect | Proves |
|---|---|---|
| (a) good — draft reworded, same numbers/fields/category | `true` | happy path |
| (b) invented number — a number not in draft ∪ struct | `false` | numeric containment |
| (c) dropped field — omits a field the draft populated | `false` | field parity (loss) |
| (d) added field — populates a field the draft left empty | `false` | field parity (invention) |
| (e) wrong category — renames the primary constraint | `false` | category fidelity |
| (f) null-constraint branch — 3-field draft, good rewrite | `true` | null branch shape holds |
| (g) null-constraint branch — 3-field draft, AI adds a 4th field | `false` | field parity pins 3-field shape |
| (h) numeric equivalence — `45` vs `45.0` vs `45%` | `true` | value-based membership |

**vitest — `generateProse` (SDK `messages.parse` mocked, deterministic):**
- parse returns a good reworded block → returns `ReportBlocks`;
- parse returns a block that fails `passesFactCheck` → returns `null`;
- `messages.parse` throws → returns `null` (never throws).

**pgTAP — `save_prose`** (mirror `save_diagnosis` tests; +1 file → Files=16):
- non-admin member → raises `insufficient_privilege`;
- anon → raises;
- admin → writes `prose` + `prose_source` to the correct `(run, hash)` row (assert values landed);
- `generated_at` bumped;
- idempotent — called twice with same args → one row, no error;
- 0-row guard — bogus `response_hash` → raises `no diagnosis found…`.

## 12. Method / house rules

- Flow: this spec → user review → `superpowers:writing-plans` → `superpowers:subagent-driven-development` (impl + reviewer sonnet per task; final whole-branch review opus) → `superpowers:verification-before-completion` → `superpowers:finishing-a-development-branch` **with** the user → STOP for explicit go-ahead before push (MylesM18).
- Verify by RUNNING, not reading. Don't invent methodology/thresholds. No browser storage. Model strings from env. Anthropic SDK server-side ONLY.
- `.superpowers/` stays untracked. Push only on explicit go-ahead.

## 13. Files touched (summary)

New:
- `lib/ai/prose.ts` (exports `generateProse`, `passesFactCheck`, `ReportBlocksSchema`)
- `supabase/migrations/<ts>_rpc_save_prose.sql`
- vitest spec(s) for `prose.ts`; pgTAP file for `save_prose`

Changed:
- `app/app/[churchId]/actions.ts` — ~15-line isolated block after `:106`
- `package.json` — add `@anthropic-ai/sdk`
- `.env.example` / env docs — three vars

Untouched (by design):
- `app/app/[churchId]/diagnosis/page.tsx` (M5a `PROSE_MODE` read gate already correct)
- `lib/ai/fallback.ts` (the `ReportBlocks` contract + `fallbackProse` are the ground truth)
