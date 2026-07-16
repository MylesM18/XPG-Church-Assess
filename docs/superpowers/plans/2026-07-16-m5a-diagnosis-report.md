# M5a — Diagnosis Run + Report Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a church **admin** press one dashboard button to run the already-shipped deterministic engine over the collected responses, persist the diagnosis, complete the run, and land on a mobile-first report page at `/app/[churchId]/diagnosis` that renders fully from the deterministic fallback renderer.

**Architecture:** M5a is ~80% wiring. Two new SECURITY DEFINER RPCs move rows/JSON (`get_run_responses` reads raw rows server-side; `save_diagnosis` upserts the diagnosis + completes the run, admin-gated). One server action orchestrates: coverage gate → load raw responses (server-only, never sent to the browser) → pure `diagnose()` → content-address the response set → persist → redirect. One read-only report page renders 10 sections from the persisted `Diagnosis` payload via `fallbackProse()` + a pure `chainWalk()` view helper. The dashboard button flips from a disabled stub to a live generate/view control.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, Supabase (`@supabase/ssr`, anon key → RLS + SECURITY DEFINER RPCs), Postgres/pgTAP, Vitest, Tailwind v4 (`@theme` tokens), TypeScript, Zod (methodology schema), `node:crypto` (sha256).

## Global Constraints

Every task implicitly includes these. Copied verbatim from the spec §12 (guardrails):

- **Deterministic engine, additive AI.** `diagnose()` is pure; no model decides any number or verdict. The report renders fully with `PROSE_MODE=fallback`. In M5a `diagnoses.prose` is always null → the page always calls `fallbackProse()`. The persisted-prose branch is forward-compat for M5b only.
- **Permission wall in Postgres RLS, not UI.** Anon key → RLS only. **No `lib/supabase/service.ts`.** All writes go through SECURITY DEFINER RPCs. `invitations`/`responses` keep NO RLS SELECT policy (default-deny, RPC-only).
- **Raw per-respondent responses leave the DB in exactly one place** — the member-gated `get_run_responses` RPC — and only into the Node server action. They are **never** serialized to the browser. The browser only ever receives the aggregated `Diagnosis` payload via the members-only `diagnoses_select` policy.
- **`save_diagnosis` is admin-gated** (matches the admin-only "Generate diagnosis" button).
- **Methodology semantics stay in TS, not SQL.** The RPCs only move rows/JSON. `methodology_version` is stamped on the diagnosis row **and** folded into the sha256 response hash.
- **`--berry #8E2B3E` is foreground/accent only** (constraint text, left-border, score bar) — **never** a tile or section background fill. Passing/holding uses `sage`.
- **Do NOT `npm audit fix --force`.** New migrations numbered `20260716001000+`.
- **Baselines must never drop:** 111 pgTAP assertions + 106 vitest cases today (plus `tsc --noEmit` 0 errors, `eslint .` 0 warnings/errors, `next build` ok). New tests are strictly additive — this plan adds 2 pgTAP files (`plan(7)` each) and 2 vitest files (7 cases total), so counts only rise.
- **Branch `feat/m5a-diagnosis-report` off `master`.** Push to the PRIVATE `github.com/MylesM18/XPG-Church-Assess` (gh user MylesM18) **only on explicit go-ahead** — never during implementation.

**Path-alias convention (follow the existing files):** `lib/` files use relative imports (e.g. `../engine/types`), matching `lib/report/render.ts` and `lib/ai/fallback.ts`. `app/` files use the `@/` alias (e.g. `@/lib/engine`), matching the existing dashboard.

**The hard safety gate (spec §2):** `diagnose()` must NEVER run unless `coverage(rows, categories).coveredCount === 8`. An unanswered category scores 0 → BROKEN → a phantom primary constraint. Enforced in TWO places: the dashboard button (convenience) AND the server action (the guarantee).

---

## File Manifest

**New:**
- `lib/report/response-hash.ts` — pure `responseHash()` (Task 1)
- `tests/report/response-hash.test.ts` — its vitest (Task 1)
- `lib/report/chain-walk.ts` — pure `chainWalk()` + `StageView` (Task 2)
- `tests/report/chain-walk.test.ts` — its vitest (Task 2)
- `supabase/migrations/20260716001000_rpc_get_run_responses.sql` (Task 3)
- `supabase/tests/11_get_run_responses_test.sql` (Task 3)
- `supabase/migrations/20260716001100_rpc_save_diagnosis.sql` (Task 4)
- `supabase/tests/12_save_diagnosis_test.sql` (Task 4)
- `app/app/[churchId]/diagnosis/report.tsx` — presentational section components (Task 6)
- `app/app/[churchId]/diagnosis/page.tsx` — report page server component (Task 7)
- `app/app/[churchId]/generate-button.tsx` — client button (Task 8)

**Changed:**
- `app/app/[churchId]/actions.ts` — add `generateDiagnosis` (Task 5)
- `app/app/[churchId]/page.tsx` — flip the "View diagnosis" stub; fetch role + run + diagnosis-existence (Task 9)

---

## Task 1: `responseHash()` pure helper

Content-addresses the response set so the same answers under the same methodology reuse the cached diagnosis. Server-only (`node:crypto`), pure, order-independent.

**Files:**
- Create: `lib/report/response-hash.ts`
- Test: `tests/report/response-hash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface HashableRow { category_id: string; item_id: string; value: number; respondent_label: string }` and `responseHash(rows: HashableRow[], methodologyVersion: string): string`. Task 5 calls it with the raw `get_run_responses` rows (which structurally satisfy `HashableRow`, being `Response`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/report/response-hash.test.ts
import { describe, it, expect } from 'vitest';
import { responseHash } from '../../lib/report/response-hash';

const rows = [
  { category_id: 'guest', item_id: 'G1', value: 5, respondent_label: 'Pastor' },
  { category_id: 'guest', item_id: 'G2', value: 7, respondent_label: 'Pastor' },
  { category_id: 'conn', item_id: 'C1', value: 3, respondent_label: 'Elder' },
];

describe('responseHash', () => {
  it('is deterministic for the same rows and version', () => {
    expect(responseHash(rows, '0.1.0')).toBe(responseHash(rows, '0.1.0'));
  });

  it('is independent of row order', () => {
    const shuffled = [rows[2]!, rows[0]!, rows[1]!];
    expect(responseHash(shuffled, '0.1.0')).toBe(responseHash(rows, '0.1.0'));
  });

  it('changes when any value changes', () => {
    const changed = [{ ...rows[0]!, value: 6 }, rows[1]!, rows[2]!];
    expect(responseHash(changed, '0.1.0')).not.toBe(responseHash(rows, '0.1.0'));
  });

  it('changes when the methodology version changes', () => {
    expect(responseHash(rows, '0.2.0')).not.toBe(responseHash(rows, '0.1.0'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/report/response-hash.test.ts`
Expected: FAIL — `Failed to resolve import "../../lib/report/response-hash"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/report/response-hash.ts
import { createHash } from 'node:crypto';

export interface HashableRow {
  category_id: string;
  item_id: string;
  value: number;
  respondent_label: string;
}

/**
 * Content-addresses a response set. Canonicalizes by sorting rows on
 * (category_id, item_id, respondent_label, value), serializing to a stable
 * array-of-arrays JSON (no object key-order ambiguity), prefixing the
 * methodology version, and sha256-ing. A methodology bump busts the cache.
 * Server-only (node:crypto).
 */
export function responseHash(rows: HashableRow[], methodologyVersion: string): string {
  const sorted = [...rows].sort(
    (a, b) =>
      a.category_id.localeCompare(b.category_id) ||
      a.item_id.localeCompare(b.item_id) ||
      a.respondent_label.localeCompare(b.respondent_label) ||
      a.value - b.value,
  );
  const canonical = JSON.stringify(
    sorted.map((r) => [r.category_id, r.item_id, r.respondent_label, r.value]),
  );
  return createHash('sha256').update(`${methodologyVersion}|${canonical}`).digest('hex');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/report/response-hash.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/report/response-hash.ts tests/report/response-hash.test.ts
git commit -m "feat(m5a): add pure responseHash content-addressing helper"
```

---

## Task 2: `chainWalk()` pure view helper

Arranges the 5 chain stages for the Treatment-A visual. Pure; reads only the already-computed `Diagnosis` (never re-derives the constraint).

**Files:**
- Create: `lib/report/chain-walk.ts`
- Test: `tests/report/chain-walk.test.ts`

**Interfaces:**
- Consumes: `Diagnosis` from `../engine/types`, `Methodology` from `../methodology/schema`, `CategoryState` from `../engine/types`.
- Produces: `type StageBucket = 'holding' | 'constraint' | 'downstream'`; `interface StageView { category_id: string; name: string; score: number; state: CategoryState; bucket: StageBucket; isDoNotWorkOn: boolean }`; `chainWalk(diagnosis: Diagnosis, methodology: Methodology): StageView[]` (length 5, in chain order). Task 6 (`ChainWalk`/`StageTile`) and Task 7 (page) consume `StageView[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/report/chain-walk.test.ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { chainWalk } from '../../lib/report/chain-walk';
import { answers, buildResponses } from '../engine/helpers';

const m = loadMethodology();
const ctx = { attendance_band: '500_999' };
const byId = (stages: ReturnType<typeof chainWalk>, id: string) =>
  stages.find((s) => s.category_id === id)!;

describe('chainWalk', () => {
  it('mid-chain constraint: upstream holds, constraint marked, broken downstream is do-not-work-on', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 8), answers(m, 'conn', 2), answers(m, 'disc', 8),
        answers(m, 'vol', 2), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(stages.map((s) => s.category_id)).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
    expect(byId(stages, 'guest').bucket).toBe('holding');
    expect(byId(stages, 'conn').bucket).toBe('constraint');
    expect(byId(stages, 'disc').bucket).toBe('downstream');
    expect(byId(stages, 'vol').bucket).toBe('downstream');
    expect(byId(stages, 'vol').isDoNotWorkOn).toBe(true);
    expect(byId(stages, 'disc').isDoNotWorkOn).toBe(false);
  });

  it('no constraint: every stage holds and nothing is do-not-work-on', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 8), answers(m, 'conn', 8), answers(m, 'disc', 8),
        answers(m, 'vol', 8), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(stages.every((s) => s.bucket === 'holding')).toBe(true);
    expect(stages.every((s) => s.isDoNotWorkOn === false)).toBe(true);
  });

  it('stage-1 constraint: no upstream, the rest are downstream', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 2), answers(m, 'conn', 8), answers(m, 'disc', 8),
        answers(m, 'vol', 8), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(byId(stages, 'guest').bucket).toBe('constraint');
    expect(byId(stages, 'conn').bucket).toBe('downstream');
    expect(byId(stages, 'gen').bucket).toBe('downstream');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/report/chain-walk.test.ts`
Expected: FAIL — `Failed to resolve import "../../lib/report/chain-walk"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/report/chain-walk.ts
import type { CategoryState, Diagnosis } from '../engine/types';
import type { Methodology } from '../methodology/schema';

export type StageBucket = 'holding' | 'constraint' | 'downstream';

export interface StageView {
  category_id: string;
  name: string;
  score: number;
  state: CategoryState;
  bucket: StageBucket;
  isDoNotWorkOn: boolean;
}

/**
 * Walks methodology.rules.chain = [guest, conn, disc, vol, gen] in order and
 * buckets each stage relative to the already-computed primary constraint.
 * Pure: reads the Diagnosis, never re-derives the constraint.
 */
export function chainWalk(diagnosis: Diagnosis, methodology: Methodology): StageView[] {
  const chain = methodology.rules.chain;
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const catById = new Map(diagnosis.categories.map((c) => [c.category_id, c]));
  const doNotWorkOn = new Set(diagnosis.do_not_work_on.map((x) => x.category_id));
  const primaryIndex = diagnosis.primary_constraint
    ? chain.indexOf(diagnosis.primary_constraint.category_id)
    : -1;

  return chain.map((category_id, i) => {
    let bucket: StageBucket;
    if (primaryIndex === -1 || i < primaryIndex) bucket = 'holding';
    else if (i === primaryIndex) bucket = 'constraint';
    else bucket = 'downstream';

    const cat = catById.get(category_id);
    return {
      category_id,
      name: names.get(category_id) ?? category_id,
      score: cat?.score ?? 0,
      state: (cat?.state ?? 'ok') as CategoryState,
      bucket,
      isDoNotWorkOn: doNotWorkOn.has(category_id),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/report/chain-walk.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/report/chain-walk.ts tests/report/chain-walk.test.ts
git commit -m "feat(m5a): add pure chainWalk view helper for the report"
```

---

## Task 3: `get_run_responses` RPC + pgTAP

Member-gated SECURITY DEFINER function returning the RAW response rows for the church's single `in_progress` run. Its four columns map 1:1 onto the engine `Response` interface. Confidentiality is enforced by *where it is called* (server-only) + *what reaches the client* (nothing).

**Files:**
- Create: `supabase/migrations/20260716001000_rpc_get_run_responses.sql`
- Test: `supabase/tests/11_get_run_responses_test.sql`

**Interfaces:**
- Consumes: existing `assessment_runs`, `responses`, `church_members` tables.
- Produces: `public.get_run_responses(p_church_id uuid) returns table(category_id text, item_id text, value int, respondent_label text)`, granted to `authenticated`. Task 5 calls it via `supabase.rpc('get_run_responses', { p_church_id })`.

> **Note:** `npm run test:db` runs `supabase db reset && supabase test db` — it applies ALL migrations then runs ALL pgTAP files. So writing the test file first (Step 1) makes the whole suite fail on file `11_` (the function does not exist), which is the intended "red"; adding the migration (Step 3) turns the full suite green.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/11_get_run_responses_test.sql
begin;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1111111-1111-1111-1111-111111111111','authenticated','authenticated','respadmin@test.com','x',now(),now()),
 ('c2222222-2222-2222-2222-222222222222','authenticated','authenticated','respstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Responses Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed one invitation + three responses on the in_progress run (mirrors 10_get_run_coverage_test)
insert into invitations (run_id, church_id, category_id, created_by)
select (select id from assessment_runs
        where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress'),
       (select id from churches where name = 'Responses Test Church'),
       'guest', 'c1111111-1111-1111-1111-111111111111';

insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, invitation_id, respondent_label)
select (select id from assessment_runs
        where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress'),
       (select id from churches where name = 'Responses Test Church'),
       'guest', v.item, 5, 'invited',
       (select id from invitations
        where church_id = (select id from churches where name = 'Responses Test Church') and category_id = 'guest'),
       'Someone'
from (values ('G1'),('G2'),('G3')) as v(item);

-- member reads the raw rows
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'member gets the run''s three raw response rows');
select is((select value from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'), 5,
          'raw value for G1 is 5');
select is((select respondent_label from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'), 'Someone',
          'raw respondent_label for G1 is preserved');

-- run-scoping: a second (complete) run's rows are excluded
reset role;
insert into assessment_runs (church_id, methodology_version, status, completed_at)
values ((select id from churches where name = 'Responses Test Church'), '0.1.0', 'complete', now());
insert into invitations (run_id, church_id, category_id, created_by)
select (select id from assessment_runs
        where church_id = (select id from churches where name = 'Responses Test Church') and status = 'complete'),
       (select id from churches where name = 'Responses Test Church'),
       'conn', 'c1111111-1111-1111-1111-111111111111';
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, invitation_id, respondent_label)
values ((select id from assessment_runs
         where church_id = (select id from churches where name = 'Responses Test Church') and status = 'complete'),
        (select id from churches where name = 'Responses Test Church'),
        'conn', 'C1', 9, 'invited',
        (select id from invitations
         where church_id = (select id from churches where name = 'Responses Test Church') and category_id = 'conn'),
        'Elder');
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'only the in_progress run''s rows are returned (complete run excluded)');

-- a non-member cannot read
set local request.jwt.claims to '{"sub":"c2222222-2222-2222-2222-222222222222","email":"respstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_run_responses((select id from churches where name = 'Responses Test Church'))$$,
  '42501', 'not a member of this church', 'non-member cannot read raw responses');

-- anon cannot execute the function at all (revoked); assert SQLSTATE only
set local role anon;
select throws_ok(
  $$select * from get_run_responses((select id from churches where name = 'Responses Test Church'))$$,
  '42501');

-- no in_progress run → zero rows
reset role;
update assessment_runs set status = 'complete', completed_at = now()
where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress';
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 0,
          'no in_progress run → zero rows');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npm run test:db`
Expected: FAIL on `11_get_run_responses_test.sql` — `function get_run_responses(uuid) does not exist`. Files `00`–`10` still pass.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260716001000_rpc_get_run_responses.sql
create function public.get_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_run_responses(uuid) from public, anon;
grant execute on function public.get_run_responses(uuid) to authenticated;
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm run test:db`
Expected: PASS — `11_get_run_responses_test.sql .. ok` (7 assertions), full suite green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716001000_rpc_get_run_responses.sql supabase/tests/11_get_run_responses_test.sql
git commit -m "feat(m5a): add member-gated get_run_responses RPC + pgTAP"
```

---

## Task 4: `save_diagnosis` RPC + pgTAP

Admin-gated SECURITY DEFINER function that atomically upserts the diagnosis (idempotent on `unique (run_id, response_hash)`) and completes the run. `diagnoses` has NO INSERT RLS policy, so this RPC is its sole writer.

**Files:**
- Create: `supabase/migrations/20260716001100_rpc_save_diagnosis.sql`
- Test: `supabase/tests/12_save_diagnosis_test.sql`

**Interfaces:**
- Consumes: existing `diagnoses`, `assessment_runs`, `church_members` tables.
- Produces: `public.save_diagnosis(p_church_id uuid, p_response_hash text, p_methodology_version text, p_payload jsonb) returns void`, granted to `authenticated`. Task 5 calls it via `supabase.rpc('save_diagnosis', {...})`.

> **Idempotency test note:** `save_diagnosis` completes the run, so a naive "call twice" would hit `no active run` on the second call. The test isolates the on-conflict-do-nothing behavior by re-opening the run (superuser) between calls, then verifies the final "no in_progress run → raise" branch on the same church.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/12_save_diagnosis_test.sql
begin;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','saveadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','saveviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','savestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Save Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Save Test Church'),
        'd2222222-2222-2222-2222-222222222222', 'viewer',
        'd1111111-1111-1111-1111-111111111111');

-- admin saves a diagnosis
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;

select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'admin save inserts exactly one diagnoses row');
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'complete',
          'the run is flipped to complete');
select ok((select completed_at is not null from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')),
          'completed_at is set');

-- idempotency: re-open the run, save again with the SAME hash → still one row
update assessment_runs set status = 'in_progress', completed_at = null
where church_id = (select id from churches where name = 'Save Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;
select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'a second identical save is idempotent — no duplicate row');

-- a viewer cannot save
set local role authenticated;
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"saveviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a viewer cannot save a diagnosis');

-- a non-member cannot save
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"savestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a non-member cannot save a diagnosis');

-- no active run → raise (the run is complete again after the idempotent save above)
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb)$$,
  'no active run for this church',
  'admin save with no in_progress run is rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npm run test:db`
Expected: FAIL on `12_save_diagnosis_test.sql` — `function save_diagnosis(uuid, text, text, jsonb) does not exist`. Files `00`–`11` pass.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260716001100_rpc_save_diagnosis.sql
create function public.save_diagnosis(
  p_church_id uuid,
  p_response_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
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

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.diagnoses (run_id, response_hash, methodology_version, payload)
  values (v_run_id, p_response_hash, p_methodology_version, p_payload)
  on conflict (run_id, response_hash) do nothing;

  update public.assessment_runs
  set status = 'complete', completed_at = coalesce(completed_at, now())
  where id = v_run_id;
end;
$$;

revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated;
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm run test:db`
Expected: PASS — `12_save_diagnosis_test.sql .. ok` (7 assertions), full suite green. Baseline pgTAP files `00`–`10` still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716001100_rpc_save_diagnosis.sql supabase/tests/12_save_diagnosis_test.sql
git commit -m "feat(m5a): add admin-gated save_diagnosis RPC + pgTAP"
```

---

## Task 5: `generateDiagnosis` server action

Orchestrates the generate flow. Co-locate with the existing `createInvitation` in the dashboard actions module. The coverage gate is the hard server-side guarantee. `redirect()` is the last statement, outside any try/catch (it throws `NEXT_REDIRECT` by design).

**Files:**
- Modify: `app/app/[churchId]/actions.ts` (add imports + the `generateDiagnosis` export)

**Interfaces:**
- Consumes: `responseHash` (Task 1), `get_run_coverage`/`get_run_responses` (existing/Task 3), `save_diagnosis` (Task 4), `diagnose` + `Response` (existing engine), `coverage` + `CoverageRow` (existing), `loadMethodology`/`createClient` (existing, already imported).
- Produces: `generateDiagnosis(churchId: string): Promise<{ ok: boolean; error?: string }>` (only the error path returns; success redirects). Task 8 (`GenerateButton`) calls it.

> **No unit test for this task.** The action integrates Supabase + the engine; its DB behavior is covered by the Task 3/4 pgTAP and its end-to-end behavior by the Task 10 verification. The deliverable here is a clean `tsc --noEmit` + `eslint .`.

- [ ] **Step 1: Add the imports**

At the top of `app/app/[churchId]/actions.ts`, the existing imports are:

```ts
'use server'

import { redirect } from 'next/navigation'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/send-invitation'
```

Replace that block with (adds `revalidatePath`, coverage, engine, and hash imports):

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/send-invitation'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { diagnose } from '@/lib/engine'
import type { Response } from '@/lib/engine/types'
import { responseHash } from '@/lib/report/response-hash'
```

> `Response` here is the engine type; within this module it shadows the DOM `Response` global, which the action never uses.

- [ ] **Step 2: Append the `generateDiagnosis` action**

Append to the end of `app/app/[churchId]/actions.ts` (after `createInvitation`):

```ts
export async function generateDiagnosis(churchId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const methodology = loadMethodology()
  const categories = methodology.questions.categories

  // HARD GATE (spec §2): never diagnose a partial run — an unanswered category scores 0 → phantom constraint.
  const { data: coverageData, error: coverageError } = await supabase.rpc('get_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) return { ok: false, error: coverageError.message }
  const rows = (coverageData ?? []) as CoverageRow[]
  if (coverage(rows, categories).coveredCount !== categories.length) {
    return { ok: false, error: 'All 8 areas must be answered before generating a diagnosis.' }
  }

  const { data: church } = await supabase
    .from('churches')
    .select('attendance_band')
    .eq('id', churchId)
    .maybeSingle()
  const ctx = { attendance_band: church?.attendance_band ?? '' }

  // Raw per-respondent rows — server-side ONLY, never returned to the browser.
  const { data: raw, error: respError } = await supabase.rpc('get_run_responses', {
    p_church_id: churchId,
  })
  if (respError) return { ok: false, error: respError.message }
  const responses = (raw ?? []) as Response[]

  const diagnosis = diagnose(responses, methodology, ctx)
  const hash = responseHash(responses, diagnosis.methodology_version)

  const { error: saveError } = await supabase.rpc('save_diagnosis', {
    p_church_id: churchId,
    p_response_hash: hash,
    p_methodology_version: diagnosis.methodology_version,
    p_payload: diagnosis,
  })
  if (saveError) return { ok: false, error: saveError.message }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  redirect(`/app/${churchId}/diagnosis`)
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npx eslint app/app/\[churchId\]/actions.ts`
Expected: no warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add app/app/\[churchId\]/actions.ts
git commit -m "feat(m5a): add generateDiagnosis server action (coverage-gated)"
```

---

## Task 6: Report section components

Presentational, pure, typed props (no data fetching). Server components — the report is read-only, no client JS. Uses only existing `@theme` tokens. `--berry` is foreground/left-border/score-bar only, never a fill.

**Files:**
- Create: `app/app/[churchId]/diagnosis/report.tsx`

**Interfaces:**
- Consumes: `Diagnosis`, `DiagnosisCategory`, `EvidenceRef` from `@/lib/engine/types`; `Methodology` from `@/lib/methodology/schema`; `ReportBlocks` from `@/lib/ai/fallback`; `StageView` from `@/lib/report/chain-walk`.
- Produces exported components: `EmptyState`, `VerdictHeader`, `ChainWalk` (+ `StageTile`), `EvidenceReceipt`, `BlindSpots`, `CostSection`, `GatingFlags`, `GenerositySplit`, `Disagreement`, `NextStep`, `Appendix`, and `confidenceBand`. Task 7 (page) imports and composes these.

> **No unit test for this task.** These are presentational server components with no logic beyond `confidenceBand` thresholds (spec §7, explicitly UI-only). The deliverable is `tsc --noEmit` + `eslint .`; visual/behavioral correctness is verified end-to-end in Task 10.

- [ ] **Step 1: Write the components**

```tsx
// app/app/[churchId]/diagnosis/report.tsx
import Link from 'next/link'
import type { Diagnosis, DiagnosisCategory, EvidenceRef } from '@/lib/engine/types'
import type { Methodology } from '@/lib/methodology/schema'
import type { StageView } from '@/lib/report/chain-walk'

// Confidence band — UI-only presentation mapping, explicitly separate from methodology YAML (spec §7).
export function confidenceBand(c: number): { label: string; low: boolean } {
  if (c >= 0.75) return { label: 'High', low: false }
  if (c >= 0.5) return { label: 'Moderate', low: false }
  return { label: 'Low', low: true }
}

export function EmptyState({ churchId }: { churchId: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-display text-2xl text-ink">No diagnosis yet</h1>
      <p className="font-body text-ink-soft">This assessment hasn&apos;t been diagnosed yet.</p>
      <Link
        href={`/app/${churchId}`}
        className="font-body text-sm text-ink underline underline-offset-2 hover:opacity-80"
      >
        ← Back to the dashboard
      </Link>
    </main>
  )
}

export function VerdictHeader({
  name, brandColor, monogram, verdict, overallScore, confidence,
}: {
  name: string
  brandColor: string
  monogram: string
  verdict: string
  overallScore: number
  confidence: number
}) {
  const band = confidenceBand(confidence)
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md font-display text-lg text-white"
          style={{ backgroundColor: brandColor }}
        >
          {monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{name}</h1>
          <p className="font-body text-sm text-ink-soft">Overall {overallScore} · Confidence: {band.label}</p>
        </div>
      </div>
      <p className="font-body text-lg text-ink">{verdict}</p>
      {band.low && (
        <p className="font-body text-sm text-ink-soft">
          Based on limited responses — add respondents to sharpen this.
        </p>
      )}
    </header>
  )
}

export function StageTile({ stage }: { stage: StageView }) {
  const isConstraint = stage.bucket === 'constraint'
  const isDownstream = stage.bucket === 'downstream'
  const label = isConstraint ? 'Constraint' : isDownstream ? 'Downstream' : 'Holding'
  const barColor = isDownstream
    ? 'var(--color-ink-soft)'
    : isConstraint
      ? 'var(--color-berry)'
      : 'var(--color-sage)'
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-md border p-3',
        isConstraint ? 'border-l-4 border-berry' : 'border-line',
        isDownstream ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className={['font-display text-base', isConstraint ? 'text-berry' : 'text-ink'].join(' ')}>
          {stage.name}
        </span>
        <span className={['font-body text-sm', isDownstream ? 'text-ink-soft' : 'text-ink'].join(' ')}>
          {label} · {stage.score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-sand">
        <div className="h-1.5 rounded-full" style={{ width: `${stage.score}%`, backgroundColor: barColor }} />
      </div>
      {isConstraint && <p className="font-body text-sm text-berry">Your constraint — work here first.</p>}
      {isDownstream && stage.isDoNotWorkOn && (
        <span className="font-body text-xs text-ink-soft">Symptom of the constraint</span>
      )}
    </div>
  )
}

export function ChainWalk({ stages }: { stages: StageView[] }) {
  const anyDownstream = stages.some((s) => s.bucket === 'downstream')
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-ink">The chain walk</h2>
      <div className="flex flex-col gap-2">
        {stages.map((s) => (
          <StageTile key={s.category_id} stage={s} />
        ))}
      </div>
      {anyDownstream && (
        <p className="font-body text-sm text-ink-soft">Don&apos;t work on the faded stages yet.</p>
      )}
    </section>
  )
}

export function EvidenceReceipt({ text, refs }: { text: string; refs: EvidenceRef[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">The evidence</h2>
      <p className="font-body text-ink">{text}</p>
      {refs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {refs.map((r) => (
            <li key={r.ref} className="font-body text-sm text-ink-soft">
              {r.ref}: {r.value ?? 'n/a'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function BlindSpots({ text }: { text: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Blind spots</h2>
      <p className="font-body text-ink">{text}</p>
    </section>
  )
}

export function CostSection({ cost, doNotWorkOn }: { cost: string; doNotWorkOn?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">What it&apos;s costing you</h2>
      <p className="font-body text-ink">{cost}</p>
      {doNotWorkOn && <p className="font-body text-sm text-ink-soft">{doNotWorkOn}</p>}
    </section>
  )
}

export function GatingFlags({ text }: { text: string }) {
  // Flags never headline — a muted secondary note (spec §6.2 row 6).
  return (
    <section className="flex flex-col gap-1">
      <p className="font-body text-sm text-ink-soft">{text}</p>
    </section>
  )
}

const GENEROSITY_COPY: Record<'breadth' | 'depth' | 'both', string> = {
  breadth:
    'Breadth: your givers are generous — there just aren’t enough of them yet. This routes upstream to connection.',
  depth: 'Depth: most of your people give, but few have been taught why. The opportunity is discipleship around generosity.',
  both: 'Both breadth and depth are low: few givers, and little teaching behind the giving.',
}

export function GenerositySplit({ mode }: { mode: 'breadth' | 'depth' | 'both' }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Generosity</h2>
      <p className="font-body text-ink">{GENEROSITY_COPY[mode]}</p>
    </section>
  )
}

export function Disagreement({
  text, respondents,
}: {
  text: string
  respondents: Array<{ label: string; mean: number }>
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Where your leaders disagree</h2>
      <p className="font-body text-ink">{text}</p>
      {respondents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respondents.map((r) => (
            <li key={r.label} className="font-body text-sm text-ink-soft">
              {r.label}: {r.mean.toFixed(1)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function NextStep({
  callType, hook, nextStep,
}: {
  callType: string
  hook: string
  nextStep: string
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-xl text-ink">Recommended next step</h2>
      <p className="font-body text-ink">{nextStep}</p>
      <p className="font-body text-base text-ink">{callType} — {hook}</p>
    </section>
  )
}

export function Appendix({
  diagnosis, methodology, benchmarkNote,
}: {
  diagnosis: Diagnosis
  methodology: Methodology
  benchmarkNote: string
}) {
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]))
  const chain = methodology.rules.chain
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Appendix — all scores</h2>
      <ul className="flex flex-col gap-1">
        {diagnosis.categories.map((c: DiagnosisCategory) => {
          const idx = chain.indexOf(c.category_id)
          const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler'
          return (
            <li key={c.category_id} className="font-body text-sm text-ink-soft">
              {names.get(c.category_id) ?? c.category_id} ({tag}): {c.score}
              {c.cohort_percentile !== null ? ` · ${c.cohort_percentile}th pct` : ''}
            </li>
          )
        })}
      </ul>
      <p className="font-body text-xs text-ink-soft">{benchmarkNote}</p>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint app/app/\[churchId\]/diagnosis/report.tsx`
Expected: no warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add app/app/\[churchId\]/diagnosis/report.tsx
git commit -m "feat(m5a): add presentational report section components"
```

---

## Task 7: Report page (`diagnosis/page.tsx`)

Read-only server component. All reads go through RLS SELECT — no new read RPC. Renders 10 sections; conditional sections show only when their `ReportBlocks` field is present. In M5a `prose` is always null → always `fallbackProse`.

**Files:**
- Create: `app/app/[churchId]/diagnosis/page.tsx`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `loadMethodology`, `resolveBrand`, `fallbackProse` + `ReportBlocks` (`@/lib/ai/fallback`), `chainWalk` (Task 2), `Diagnosis` (`@/lib/engine/types`), all components from `./report` (Task 6).
- Produces: the default-exported route `DiagnosisPage`. No downstream consumer (leaf route).

> **No unit test for this task.** Route composition is verified by `next build` + the Task 10 end-to-end pass. Deliverable: `tsc` + `eslint` + `next build` all green.

- [ ] **Step 1: Write the page**

```tsx
// app/app/[churchId]/diagnosis/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { chainWalk } from '@/lib/report/chain-walk'
import type { Diagnosis } from '@/lib/engine/types'
import {
  EmptyState,
  VerdictHeader,
  ChainWalk,
  EvidenceReceipt,
  BlindSpots,
  CostSection,
  GatingFlags,
  GenerositySplit,
  Disagreement,
  NextStep,
  Appendix,
} from './report'

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()
  if (!church) notFound()

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, status')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let diagRow: { payload: unknown; prose: unknown } | null = null
  if (run) {
    const { data } = await supabase
      .from('diagnoses')
      .select('payload, prose, prose_source, generated_at')
      .eq('run_id', run.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    diagRow = data
  }

  if (!diagRow) return <EmptyState churchId={churchId} />

  const diagnosis = diagRow.payload as Diagnosis
  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)

  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  const blocks: ReportBlocks =
    PROSE_MODE !== 'fallback' && diagRow.prose
      ? (diagRow.prose as ReportBlocks)
      : fallbackProse(diagnosis, methodology)

  const stages = chainWalk(diagnosis, methodology)

  const primaryId = diagnosis.primary_constraint?.category_id ?? null
  const receipt = primaryId
    ? diagnosis.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined
  const dispersion = diagnosis.dispersion_flags[0]

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={church.name}
        brandColor={church.brand_color}
        monogram={brand.monogram}
        verdict={blocks.verdict}
        overallScore={diagnosis.overall_score}
        confidence={diagnosis.confidence}
      />

      <ChainWalk stages={stages} />

      {blocks.evidence && <EvidenceReceipt text={blocks.evidence} refs={receipt?.refs ?? []} />}
      {blocks.blind_spot && <BlindSpots text={blocks.blind_spot} />}
      {blocks.cost && <CostSection cost={blocks.cost} doNotWorkOn={blocks.do_not_work_on} />}
      {blocks.gating && <GatingFlags text={blocks.gating} />}
      {diagnosis.generosity_mode !== null && <GenerositySplit mode={diagnosis.generosity_mode} />}
      {blocks.dispersion && (
        <Disagreement text={blocks.dispersion} respondents={dispersion?.respondents ?? []} />
      )}

      <NextStep
        callType={diagnosis.offer.call_type}
        hook={diagnosis.offer.hook}
        nextStep={blocks.next_step}
      />

      <Appendix diagnosis={diagnosis} methodology={methodology} benchmarkNote={blocks.benchmark_note} />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If TS complains that `diagRow.prose` is `unknown` in a truthiness check — it is allowed; `unknown` is valid in a boolean position.)

- [ ] **Step 3: Lint**

Run: `npx eslint app/app/\[churchId\]/diagnosis/page.tsx`
Expected: no warnings or errors.

- [ ] **Step 4: Build to verify the route compiles**

Run: `npm run build`
Expected: success; `/app/[churchId]/diagnosis` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add app/app/\[churchId\]/diagnosis/page.tsx
git commit -m "feat(m5a): add read-only diagnosis report page"
```

---

## Task 8: `GenerateButton` client component

Small `'use client'` component that calls `generateDiagnosis` via `useTransition`, shows a pending state, and surfaces the returned `error` inline. On success the action redirects, so there is no success branch to render.

**Files:**
- Create: `app/app/[churchId]/generate-button.tsx`

**Interfaces:**
- Consumes: `generateDiagnosis` from `./actions` (Task 5).
- Produces: `GenerateButton({ churchId }: { churchId: string })`. Task 9 (dashboard) imports it.

> **No unit test for this task.** A trivial client wrapper; behavior is verified in Task 10. Deliverable: `tsc` + `eslint`.

- [ ] **Step 1: Write the component**

```tsx
// app/app/[churchId]/generate-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { generateDiagnosis } from './actions'

export function GenerateButton({ churchId }: { churchId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await generateDiagnosis(churchId)
            // On success the action redirects (throws NEXT_REDIRECT) and this never runs;
            // only the { ok:false } error path returns a value.
            if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
          })
        }
        className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Generating…' : 'Generate diagnosis'}
      </button>
      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint app/app/\[churchId\]/generate-button.tsx`
Expected: no warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add app/app/\[churchId\]/generate-button.tsx
git commit -m "feat(m5a): add GenerateButton client control"
```

---

## Task 9: Dashboard control flip

Replace the disabled "View diagnosis" stub with a live generate/view/disabled-with-reason control. Keep "Manage access" disabled (that is M5d). Add role + run + diagnosis-existence reads (all RLS-guarded SELECT).

**Files:**
- Modify: `app/app/[churchId]/page.tsx`

**Interfaces:**
- Consumes: `GenerateButton` from `./generate-button` (Task 8); existing `coverage` result, `Link`.
- Produces: no new exports (route behavior change).

> **No unit test for this task.** Verified end-to-end in Task 10 (all four control states). Deliverable: `tsc` + `eslint` + `next build`.

- [ ] **Step 1: Add the `GenerateButton` import**

In `app/app/[churchId]/page.tsx`, after the existing `import { InvitePanel } from './invite-panel'` line (line 8), add:

```tsx
import { GenerateButton } from './generate-button'
```

- [ ] **Step 2: Narrow `DISABLED_STUBS` to just "Manage access"**

Replace the existing block (lines 22–26):

```tsx
// M5 stubs remain disabled; M4 stubs become links (rendered inline below).
const DISABLED_STUBS = [
  ['View diagnosis', 'M5'],
  ['Manage access', 'M5'],
] as const
```

with:

```tsx
// 'View diagnosis' is now a live control (see the diagnosis section below).
// 'Manage access' stays disabled until M5d.
const DISABLED_STUBS = [['Manage access', 'M5d']] as const
```

- [ ] **Step 3: Add role + run + diagnosis-existence reads**

In `DashboardPage`, immediately after the `const header = ...` line (currently line 58), insert:

```tsx
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  const role = membership?.role ?? null

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let hasDiagnosis = false
  if (run) {
    const { data: diagRows } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('run_id', run.id)
      .limit(1)
    hasDiagnosis = (diagRows?.length ?? 0) > 0
  }
```

- [ ] **Step 4: Replace the stub `<section>` with the diagnosis control**

Replace the existing final section (currently lines 104–116):

```tsx
      <section className="flex flex-wrap gap-2">
        {DISABLED_STUBS.map(([label, milestone]) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            {label} <span className="text-xs">({milestone})</span>
          </button>
        ))}
      </section>
```

with:

```tsx
      <section className="flex flex-wrap items-start gap-2">
        {hasDiagnosis ? (
          <Link
            href={`/app/${churchId}/diagnosis`}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90"
          >
            View diagnosis
          </Link>
        ) : result.coveredCount === categories.length && role === 'admin' ? (
          <GenerateButton churchId={churchId} />
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            Generate diagnosis{' '}
            <span className="text-xs">
              (
              {result.coveredCount < categories.length
                ? `Answer all 8 areas first — ${result.coveredCount} of ${categories.length}`
                : 'Admins can generate the diagnosis'}
              )
            </span>
          </button>
        )}

        {DISABLED_STUBS.map(([label, milestone]) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            {label} <span className="text-xs">({milestone})</span>
          </button>
        ))}
      </section>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint app/app/\[churchId\]/page.tsx`
Expected: no errors, no warnings.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add app/app/\[churchId\]/page.tsx
git commit -m "feat(m5a): flip dashboard stub to live generate/view diagnosis control"
```

---

## Task 10: Full verification + end-to-end

Run the complete gate suite and drive the flow in a browser. Nothing new is written unless a check fails (then fix at the source and re-run from the failing gate).

**Files:** none (verification only).

- [ ] **Step 1: Full static + unit gate**

Run each and confirm green:

```bash
npm run typecheck        # 0 errors
npm run lint             # eslint . → 0 warnings/errors
npm test                 # vitest run → baseline 106 + 7 new = 113 cases, all pass
npm run build            # next build ok
```

Expected: `npm test` shows the two new files (`tests/report/response-hash.test.ts` 4 passed, `tests/report/chain-walk.test.ts` 3 passed) and no regressions in the engine/report baseline.

- [ ] **Step 2: Full pgTAP gate**

Run: `npm run test:db`
Expected: all files `00`–`12` pass; the two new files add `plan(7)` each. Baseline 111 assertions never drops; total rises.

- [ ] **Step 3: End-to-end — the happy path (admin, fully covered)**

Start the dev server via the browser preview tooling (config `cairn-start`, NOT `npm run dev` in Bash), on host `127.0.0.1:3000` (GoTrue allows only `127.0.0.1:3000/**`; keep everything on 127.0.0.1). Sign in as a church admin whose run has all 8 areas covered.

- On `/app/[churchId]`: the control reads **"Generate diagnosis"** (enabled).
- Click it → pending state → the action redirects to `/app/[churchId]/diagnosis`.
- The report renders: verdict header (monogram + brand color + overall score + confidence band), the chain walk (5 stacked tiles; the constraint tile in berry with a left-border and "Your constraint — work here first."; downstream tiles faded with the footer), and the conditional sections that match the church's data (evidence, blind spots, cost, generosity, disagreement as present), then the next-step CTA and the appendix with the priors caveat.
- Verify via `read_console_messages` (no errors) and `read_page` (constraint tile text present).

- [ ] **Step 4: End-to-end — the gates**

- Return to `/app/[churchId]`: the control now reads **"View diagnosis"** (enabled `<Link>`); clicking it re-opens the same report.
- As a **viewer** of the same church (before generation on a fresh church, or via a second church): with full coverage, the control is disabled with reason "Admins can generate the diagnosis." After an admin generates, the viewer sees "View diagnosis".
- On a church with a **partial** run: the control is disabled with reason "Answer all 8 areas first — N of 8".
- **Server gate proof:** confirm the action itself rejects a partial run even if the button were bypassed — the `coverage(...).coveredCount !== 8` branch returns the error string (covered by reading the action; no phantom-constraint diagnosis is ever written).

- [ ] **Step 5: Confidentiality spot-check**

On the report page, use `read_network_requests` to confirm the document/RSC payload contains the aggregated `Diagnosis` (category scores, constraint, dispersion means) but **no raw per-respondent `responses` rows** — raw rows exist only inside the server action's `get_run_responses` call, never in anything sent to the browser.

- [ ] **Step 6: Final confirmation**

Confirm the branch is clean and all tasks are committed:

```bash
git status        # clean
git log --oneline master..HEAD   # Task 1–9 commits present
```

Do NOT push. Report completion with the gate outputs; await the explicit go-ahead before any push (MylesM18, PRIVATE repo).

---

## Notes for the implementer

- **`diagnose()` value→score sanity:** in the Task 2 fixtures, uniform value `8` → score comfortably above the `break` threshold (~45) → "ok"; value `2` → well below → "broken". This mirrors `tests/report/render.test.ts` (which uses `3` for the primary and `7` for healthy). If a scenario's primary lands on the wrong stage, check the value spread, not `chainWalk` — the helper only reads what `diagnose()` decided.
- **`answers()` helper** (`tests/engine/helpers.ts`) fills every item in a category with the given value; `buildResponses(...)` flattens groups. Pass all 8 categories so `diagnose()` sees a complete run (enablers at `8` keep gating/dispersion quiet).
- **pgTAP `throws_ok` forms used:** `(sql, '42501', 'exact message', 'desc')` checks both SQLSTATE and message; `(sql, 'long message', 'desc')` checks message only (used for the P0001 `no active run` raise, which carries no errcode); `(sql, '42501')` checks SQLSTATE only (used for the anon "permission denied for function" case, whose message text is not asserted).
- **`redirect()` must stay the last statement**, never inside try/catch — it throws `NEXT_REDIRECT` by design (Next 16). The RPCs return `{ data, error }` and do not throw, so no try/catch is needed around them.
