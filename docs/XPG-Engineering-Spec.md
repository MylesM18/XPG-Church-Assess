# Cairn: Church Health Assessment
## Production Engineering Specification v0.1

**Audience:** Claude Code (the build agent) and the engineer reviewing its work.
**Companion documents (source of truth, read both):**
- `Cairn-Eight-Category-Frameworks.md`, the eight categories, every question, every anchor, scoring, chain logic, blind-spot triggers, offers. **This file defines the methodology content. Do not invent question text; take it from here.**
- `XPG-Church-Health-Assessment-Build-Spec.md`, the product rationale and the acceptance philosophy.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS + Storage) · Anthropic API (server-side SDK) · Resend (email) · Vercel (host).

---

## 0. The three things that must never be gotten wrong

Everything below serves these. If a decision trades one of these away for convenience, stop and flag it.

1. **The engine is deterministic. The AI is additive.** Scoring, benchmarking, and the constraint diagnosis are pure functions of the responses and the methodology. No model call ever decides the verdict. **Acceptance test: with the AI disabled, the full report still renders**, rougher prose, identical diagnosis, numbers, and offer.

2. **The permission wall is enforced at the database layer, not the UI.** Invited leaders answer one category and can never read results. Admins and approved viewers can. This is Row-Level Security in Postgres plus a tightly-scoped token flow, never a hidden `<div>`.

3. **The methodology is data, not code.** Questions, anchors, thresholds, benchmarks, and offer copy live in versioned files under `/methodology`, not inside TypeScript. Every diagnosis is stamped with `methodology_version`.

---

## 1. Repository shape

```
/app                      Next.js App Router
  /page.tsx               public landing
  /get-started            church profile creation (auth-gated)
  /app/[churchId]         admin dashboard
  /app/[churchId]/report  the diagnosis (auth + membership)
  /respond/[token]        the invited-leader questionnaire (public, tokenized)
  /r/[shareToken]         optional shared report (opt-in, revocable)
  /api/respond/[token]    GET + POST, the ONLY anon-reachable service-role surface
  /api/invitations        POST (auth)
  /api/members            POST / DELETE (auth, admin only)
  /api/report/[runId]/pdf GET (auth, member)
  (share mint/revoke are SERVER ACTIONS, not a route — see M6a)
/lib
  /engine                 PURE. no framework, no db, no network.
    normalize.ts
    score.ts
    gap.ts
    benchmark.ts
    constraint.ts
    dispersion.ts
    assemble.ts
    index.ts              export diagnose(responses, methodology): Diagnosis
    types.ts
  /methodology
    load.ts               load + validate YAML, expose typed Methodology
  /ai
    classify.ts           LLM call #1 (free-text → signals) — DEFERRED (not built yet)
    prose.ts              LLM call #2 (Diagnosis → report prose) + fallback
    fallback.ts           deterministic prose from the struct
  /brand
    resolve.ts            church → { monogram, tileColor, displayName }
  /supabase
    server.ts             server client (anon key, RLS)
    service.ts            service-role client — NEVER BUILT (guardrail: anon-key + RLS only; /api/respond/* uses SECURITY DEFINER RPCs instead, see §6)
  /report
    render.tsx            report React component (used by page + PDF)
/methodology              THE IP. versioned YAML.
  questions.yaml
  benchmarks.yaml
  rules.yaml
  copy.yaml
  offers.yaml
/supabase/migrations      SQL migrations (schema + RLS)
/tests
  engine/                 fixture churches with expected diagnoses
  rls/                    permission-wall tests
/docs                     these two spec files live here
```

> **M6a deviation (2026-07-18):** mint and revoke of report shares are implemented as server
> actions in `app/app/[churchId]/diagnosis/actions.ts`, not as `POST / DELETE /api/report-share`.
> This matches the codebase's convergence on server actions for every dashboard mutation
> (`createInvitation`, `generateDiagnosis`, the M5d access panel), gains CSRF protection and
> progressive enhancement for free, and avoids adding a second public route.
> `/r/[shareToken]` is the only new public route in M6a.

---

## 2. Identities and auth (the heart of the permission model)

There are exactly three kinds of actor. Build each one deliberately.

| Actor | Has an account? | Can do | Can NEVER do |
|---|---|---|---|
| **Admin** | Yes (Supabase Auth) | Create the church, answer categories, invite leaders, manage viewers, see the full diagnosis |, |
| **Viewer** | Yes (Supabase Auth) | See the full diagnosis for churches they're approved on | Manage access, edit the church, invite |
| **Invited leader (respondent)** | **No account** | Answer exactly one assigned category via a tokenized link, then see a thank-you | See any result, any score, any other category, or anything about the church beyond its name |

**Admin & viewer** authenticate with Supabase Auth. Use **passwordless email magic link** as the default (right for church execs); Google OAuth optional. All their reads are gated by **Row-Level Security** keyed on membership (§4).

**Invited leaders never authenticate.** They arrive at `/respond/[token]`. The token is an unguessable UUID that IS the secret. It resolves server-side to one invitation scoped to one church + one category. This path does not use the authenticated RLS client, it uses two narrowly-scoped service-role handlers (§6) that only ever read that invitation + the methodology and only ever write that category's responses. **The service-role key appears in exactly those two handlers and nowhere else reachable by an anonymous request.**

When a church is created, the creator becomes its admin. Do this atomically: a Postgres RPC (`create_church_with_admin`) that inserts the `churches` row and the `church_members(admin)` row in one transaction, so a church can never exist without an owner.

---

## 3. Dynamic church branding

The church's identity is the personability thread through the whole product. It appears in the top-left chrome, the dashboard header, the invited-leader's questionnaire header (so they see who they're helping), the report hero, and every email.

`/lib/brand/resolve.ts` exports `resolveBrand(church) → { monogram, tileColor, displayName }`:

- **`monogram`**, initials from the church name. Take the first letter of up to the first two *significant* words, skipping stopwords (`the, of, and, a, at, in, on, for`). `"Cornerstone Community Church"` → `"CC"` (or `"C"` if you prefer single-letter; make it a config constant `MONOGRAM_LETTERS = 1|2`, default 1). Single-word names → first letter. Always uppercase.
- **`tileColor`**, deterministic from the church name (or id): hash → index into a fixed curated palette of **8 deep, tasteful tones** (deep teal, slate blue, forest, plum, ink-navy, oxblood-brown, bronze, charcoal-green). **Never berry `#8E2B3E`**, berry is the semantic color for "broken/constraint" and must stay reserved. Resolve once at church creation and store as `churches.brand_color`, so it's stable even if the palette changes later.
- **`displayName`**, the church name, trimmed.

The monogram tile uses `tileColor` as background with white text. Everything else in the UI uses the standard palette (see §12 tokens). This gives each church a distinct, consistent identity with zero user effort while keeping the diagnostic color system intact.

Logo upload is **out of scope for v1** (monogram only). Leave a `churches.logo_url` column nullable for later.

---

## 4. Data model + Row-Level Security

Postgres via Supabase. `auth.users` is built in. All tables get RLS **enabled**; default-deny, then the policies below.

```sql
-- CHURCHES
create table churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  denomination text,
  context text,                    -- urban | suburban | small_town | rural
  attendance_band text,
  adults_band text,
  staff_fte_band text,
  budget_band text,
  church_age_band text,
  growth_trajectory text,
  brand_color text not null,       -- resolved monogram tile color
  logo_url text,                   -- nullable, future
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- MEMBERSHIP = the permission table
create table church_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null check (role in ('admin','viewer')),
  granted_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (church_id, user_id)
);

-- ASSESSMENT RUN (v1: one active run per church)
create table assessment_runs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches on delete cascade not null,
  methodology_version text not null,
  status text not null default 'in_progress' check (status in ('in_progress','complete')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- INVITATION = the tokenized handoff (the id IS the token)
create table invitations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references assessment_runs on delete cascade not null,
  church_id uuid references churches on delete cascade not null,
  category_id text not null,       -- matches methodology category id
  invited_name text,
  invited_contact text,
  channel text check (channel in ('email','sms')),
  status text not null default 'pending' check (status in ('pending','completed','revoked')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

-- RESPONSES (from an invited leader OR a member answering themselves)
create table responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references assessment_runs on delete cascade not null,
  church_id uuid references churches on delete cascade not null,  -- denormalized for RLS
  category_id text not null,
  item_id text not null,           -- e.g. 'C1'
  value int not null check (value between 1 and 10),
  respondent_kind text not null check (respondent_kind in ('invited','member')),
  invitation_id uuid references invitations on delete set null,
  respondent_user_id uuid references auth.users,
  respondent_label text not null,  -- display name for dispersion
  created_at timestamptz default now()
);

-- DIAGNOSIS cache (deterministic payload + AI/fallback prose)
create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references assessment_runs on delete cascade not null,
  response_hash text not null,     -- hash of the response set; regen when it changes
  methodology_version text not null,
  payload jsonb not null,          -- the deterministic Diagnosis struct
  prose jsonb,                     -- the report blocks (ai or fallback)
  prose_source text check (prose_source in ('ai','fallback')),
  generated_at timestamptz default now(),
  unique (run_id, response_hash)
);

-- OPTIONAL opt-in share links (the id IS the share token)
create table report_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references assessment_runs on delete cascade not null,
  church_id uuid references churches on delete cascade not null,
  created_by uuid references auth.users not null,
  revoked boolean not null default false,
  created_at timestamptz default now(),
  expires_at timestamptz
);
```

### RLS policies

Helper: a user is a member of a church if a `church_members` row matches `auth.uid()`.

```sql
-- churches: members read; anyone authenticated inserts (but go through the RPC);
-- only admins update.
create policy churches_select on churches for select
  using (exists (select 1 from church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid()));
create policy churches_update on churches for update
  using (exists (select 1 from church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid() and m.role='admin'));

-- church_members: you can see rows for churches you belong to;
-- only admins of that church can add/remove members.
create policy members_select on church_members for select
  using (exists (select 1 from church_members me
                 where me.church_id = church_members.church_id and me.user_id = auth.uid()));
create policy members_write on church_members for all
  using (exists (select 1 from church_members me
                 where me.church_id = church_members.church_id and me.user_id = auth.uid() and me.role='admin'))
  with check (exists (select 1 from church_members me
                 where me.church_id = church_members.church_id and me.user_id = auth.uid() and me.role='admin'));

-- runs, responses, diagnoses, invitations, report_shares:
-- SELECT allowed only to members of the church. (invitations + responses: no anon select.)
-- Apply the same member-check select policy to each. Writes for these on the
-- authenticated path (admin answering, creating invites, sharing) are also member/admin-gated.
```

**Anonymous respondents are NOT covered by these policies.** They never touch the authenticated client. Their entire surface is the two service-role handlers in §6, which run server-side and validate the token themselves.

---

## 5. The methodology layer (`/methodology`, versioned)

Five YAML files, loaded and **schema-validated** at startup by `/lib/methodology/load.ts` (fail loudly on invalid). Populate `questions.yaml` from the Frameworks document.

### `questions.yaml`
```yaml
version: "0.1.0"
categories:
  - id: guest
    name: "Guest Experience"
    kind: stage           # stage | enabler
    position: 1           # 1..5 for stages; null for enablers
    items:
      - id: G1
        text: "When a first-time guest visits, what actually happens to their information?"
        signal: evidence   # belief | evidence  (see §7.2)
        anchors: { lo: "…", mid: "…", hi: "…" }
      - id: G2
        text: "…"
        signal: evidence
        anchors: { lo: "…", mid: "…", hi: "…" }
      # …G3..G5 per the Frameworks doc
  # …all eight categories: guest, conn, disc, vol, gen (stages);
  #    gov, comm, sys (enablers)
```
Copy every item's text and lo/mid/hi anchors verbatim from the Frameworks document. Tag each item `belief` or `evidence`: **evidence** = asks for a countable share or an observable behavior (e.g. C2 group %, C3 would-they-be-missed, G2 follow-up speed, G4 measures-return, D3 new leaders, V1 serve %, V2 burnout, GEN1 give %); **belief** = softer self-perception (e.g. C1 known-by-name, D1 nameable path, C4 on-ramp quality). *This tagging is a Phase-0 item for XPG to confirm; use the Frameworks blind-spot triggers as the guide.*

### `rules.yaml`
```yaml
version: "0.1.0"
chain: [guest, conn, disc, vol, gen]     # stage order
enablers:
  gov:  { gates: all }
  comm: { gates: [guest, conn] }
  sys:  { gates: [vol, disc] }
generosity: { breadth_items: [GEN1], depth_items: [GEN2, GEN4] }
thresholds:
  break: 45            # category score below this (0-100) = broken
  severe: 25
  gate: 45             # enabler score below this = gating condition
  blind_spot_gap: 20   # belief - evidence >= this (on 0-100) = blind spot
  dispersion: 2.0      # stddev across respondents (0-10 scale) = disagreement flag
constraint_logic: |
  1. score all categories 0-100
  2. walk `chain` in order; a stage is BROKEN if score < thresholds.break
  3. primary_constraint = first broken stage
  4. do_not_work_on = every broken stage AFTER primary in the chain
  5. gating_conditions = enablers with score < thresholds.gate
  6. discipleship (disc) has no evidence items in v1 -> may be primary only if its
     own score is broken AND it is the earliest break; otherwise report as contributing
  7. generosity split: compare mean(breadth_items) vs mean(depth_items) -> breadth|depth|both
  8. if no stage is broken -> NO_STRUCTURAL_CONSTRAINT (capacity offer; invent no problem)
confidence:
  low_response_penalty: 0.15   # categories answered by only 1 person
  floor: 0.4
```

### `benchmarks.yaml`
Cohort constants by attendance band. **These are priors until enough real churches exist**, the real distributions are the Phase-0 / longitudinal dependency. Structure:
```yaml
version: "0.1.0"
source: "XPG priors v0. Replace with observed distributions at n>=200."
"500_999":
  guest:  { p25: 45, p50: 60, p75: 74 }   # category-score percentiles
  conn:   { p25: 38, p50: 52, p75: 66 }
  # …per category, per band
```

### `copy.yaml` and `offers.yaml`
`offers.yaml` maps each diagnosis outcome → `{ call_type, hook }` exactly as in the Frameworks document (note: generosity resolves to two different offers by breadth vs depth). `copy.yaml` holds the deterministic-fallback prose templates (§7.3).

---

## 6. The invited-leader flow (the tokenized handoff)

Two handlers under `/api/respond/[token]`. **These are the only anonymous-reachable code paths that use the service-role client.** Keep them tiny and audited.

**`GET /api/respond/[token]`**
1. Load the invitation by id = token (service client).
2. Reject if not found, `status != 'pending'`, or `expires_at < now()` → return a clean "this link is no longer active" state.
3. Return only: `{ church: { name, brand: resolveBrand(church) }, category: { id, name }, items: [{id, text, anchors}] }` for that one category.
4. Read nothing else. Return no scores, no other categories, no church internals.

**`POST /api/respond/[token]`**
1. Re-validate the token exactly as above.
2. Accept `{ answers: { [item_id]: value } }`. Validate every `value` is an int 1–10 and every `item_id` belongs to that category (reject otherwise).
3. Insert `responses` rows: `respondent_kind='invited'`, `invitation_id=token`, `respondent_label = invited_name || 'Invited leader'`, tied to the invitation's `run_id`, `church_id`, `category_id`.
4. Set the invitation `status='completed'`, `completed_at=now()`.
5. Return success → client shows the thank-you screen. The response body carries no results.

**Invitations are created** by an admin via `POST /api/invitations` (authenticated, member-gated): `{ church_id, category_id, invited_name, invited_contact, channel }`. On create, send the link `${APP_URL}/respond/${invitation.id}` via Resend (email), SMS via Twilio is optional/later. **Multiple invitations per category are allowed and expected** (the disagreement between respondents is a signal, §7.4).

Rate-limit both respond handlers and the invite endpoint (e.g. per-IP and per-token) to prevent abuse.

---

## 7. The engine (`/lib/engine`, pure)

`diagnose(responses: Response[], methodology: Methodology): Diagnosis`. No imports from Next, Supabase, or the network. Unit-tested in isolation. Pipeline:

```
normalize  → score → gap → benchmark → constraint → dispersion → assemble
```

### 7.1 Score
Per category: `score[cat] = mean(all item values for that category, across all respondents) * 10` → 0–100. (Items are 1–10; ×10 puts categories on 0–100.)

### 7.2 The perception–reality gap (v1 mechanism)
Within each category, split items by their `signal` tag:
```
belief[cat]   = mean(value of belief-tagged items)   * 10
evidence[cat] = mean(value of evidence-tagged items) * 10
gap[cat]      = belief[cat] - evidence[cat]
gap >= thresholds.blind_spot_gap  → BLIND_SPOT (they rate it higher than the behavior supports)
```
Categories with no evidence-tagged items (e.g. `disc` in v1) produce no gap and cannot be a blind spot.

### 7.3 Benchmark
`evidence[cat]` (or `score[cat]` where no evidence items) → percentile against the church's attendance-band cohort in `benchmarks.yaml`. Store `cohort_percentile[cat]`. (Priors in v1; note it.)

### 7.4 Dispersion
For any category answered by more than one respondent, compute each respondent's mean for that category (0–10), then the population stddev across respondents. If `stddev >= thresholds.dispersion`, emit a `dispersion_flag` with each respondent's label and mean. This is the leadership-alignment finding.

### 7.5 Constraint
Implement `rules.yaml.constraint_logic` exactly. Output `primary_constraint`, `contributing[]`, `do_not_work_on[]`, `gating_conditions[]`, `generosity_mode`, and the `NO_STRUCTURAL_CONSTRAINT` case. **The engine must be able to return "nothing is broken" and must never manufacture a constraint.**

### 7.6 Assemble → `Diagnosis`
```ts
type Diagnosis = {
  methodology_version: string;
  overall_score: number;                     // cohort-weighted; NOT the headline
  categories: Array<{
    id: string; name: string; kind: 'stage'|'enabler'; position: number|null;
    score: number; belief: number|null; evidence: number|null;
    gap: number|null; gap_class: 'blind_spot'|'underrated'|'calibrated'|null;
    cohort_percentile: number|null; state: 'broken'|'gate'|'ok'|'watch';
    respondent_count: number;
  }>;
  primary_constraint: { category_id: string } | null;   // null = NO_STRUCTURAL_CONSTRAINT
  contributing: string[];
  do_not_work_on: Array<{ category_id: string; reason: string }>;
  gating_conditions: Array<{ enabler_id: string; note: string }>;
  generosity_mode: 'breadth'|'depth'|'both'|null;
  blind_spots: Array<{ category_id: string; belief: number; evidence: number; gap: number }>;
  dispersion_flags: Array<{ category_id: string; respondents: Array<{label:string; mean:number}>; spread:number }>;
  offer: { type: string; call_type: string; hook: string };
  confidence: number;
  evidence_trail: Array<{ claim_key: string; refs: Array<{kind:'item'|'metric'; id:string; value:unknown}> }>;
};
```
Every finding carries pointers in `evidence_trail`, so the report can show a receipt for each claim.

### 7.7 Fixtures (`/tests/engine`)
Port the six fixtures from the build spec, retuned for the eight categories. At minimum:
- **Leaky Bucket**, guest healthy-ish but low evidence, flat growth → primary `guest` or `conn`; blind spot present.
- **Faithful Remnant**, low `gen` breadth, decent depth, broken `conn` upstream → primary `conn`; `gen` in `do_not_work_on`; `generosity_mode='breadth'`.
- **Broad but Shallow**, decent `gen` breadth, low depth, chain healthy → primary `gen`; `generosity_mode='depth'`.
- **Founder Bottleneck**, flow ok, `disc`/pipeline weak, `gov` low → gating on `gov`.
- **Disagreement**, two respondents on `disc`, one rates 8, one 3 → `dispersion_flag`.
- **Healthy Church**, everything ≥ p50 → `NO_STRUCTURAL_CONSTRAINT`, capacity offer, no invented problem.

`npm test` must pass all fixtures, and each fixture must produce a rendered report **with the AI disabled**.

---

## 8. The two AI calls (`/lib/ai`)

Server-side, official `@anthropic-ai/sdk`. **API key server-only.** Both calls are additive; neither decides anything.

### 8.1 `classify.ts`, free-text → signals — DEFERRED (no free-text collected yet)
- Input: the two free-text answers (D1 "one thing you'd fix", D2 "what you already tried that didn't work").
- Output (structured): `{ stated_priority: string, failed_interventions: string[], sentiment: 'urgent'|'steady'|'discouraged', themes: string[] }`.
- Model: `ANTHROPIC_MODEL_CLASSIFY` (default `claude-haiku-4-5`). Use **structured outputs** (the API supports it) so the shape is guaranteed. It classifies; it never concludes.
- Used to enrich the report ("you told us you already tried a small-group relaunch, here's why the diagnosis accounts for that"). If it fails, the report simply omits that enrichment.

### 8.2 `prose.ts`, Diagnosis → report blocks
- Input: the finished `Diagnosis` struct. (Classify signals deferred — see §8.1; M5b builds prose only.)
- Output: the nine-field `ReportBlocks` shape `{ verdict, evidence?, blind_spot?, cost?, do_not_work_on?, next_step, gating?, dispersion?, benchmark_note }` (required: verdict, next_step, benchmark_note). The offer is templated from `offers.yaml`, not written by the model. As shipped in M5b, the model rewords a fixed `fallbackProse` draft and its output is gated by `passesFactCheck` (field parity + numeric containment + category fidelity).
- Model: `ANTHROPIC_MODEL_PROSE` (default `claude-sonnet-5`).
- **System-prompt constraints (spec these into the prompt):**
  - You are given a fixed set of facts. You may not add, change, reorder, or invent any number, category, or verdict.
  - Write in this register: plain words, warm but precise. **No em-dashes. No churchy clichés.** Sentence case. Active voice. Name things the way a church leader would.
  - If a fact is absent from the struct, do not supply it.
  - Return only the JSON block shape requested.
- **Determinism:** cache the result in `diagnoses.prose` keyed by `response_hash`, so the report does not reword itself on every view. Regenerate only when the response set changes.
- Note the Sonnet 5 caveat: it rejects non-default sampling parameters, do not set custom `temperature`/`top_p`; call it plainly.

### 8.3 The fallback (`fallback.ts`) and the toggle
- `PROSE_MODE=ai|fallback` env switch. And on **any** AI error/timeout, auto-fall-back.
- `fallback.ts` fills the same nine-field `ReportBlocks` shape from templates in `copy.yaml`, interpolating the struct's values. Rougher, correct, complete.
- `diagnoses.prose_source` records which was used. **This is the mechanism that makes the acceptance test pass.**

---

## 9. Report generation & viewing

- **Deterministic first:** on report view, compute the `response_hash`; if `diagnoses` has no fresh row, run `diagnose()` and upsert the `payload`. Then produce `prose` (AI or fallback), cache it.
- **In-app report** at `/app/[churchId]/report`, React (`/lib/report/render.tsx`), auth + membership enforced by RLS. This is the primary, secure view. Layout follows the prototype: verdict hero, evidence, blind-spot gap bars, cost, do-not-work-on, gating flag, dispersion, next step, offer, and an appendix of all eight scores with chain tags. Overall score lives in the appendix, never the headline.
- **PDF** via `/api/report/[runId]/pdf`, render the same component with Playwright (or `@react-pdf` if simpler) to a downloadable PDF, auth + membership enforced. The XP forwards this to the board.
- **Optional share link**, `POST /api/report-share` (admin only) mints a `report_shares` token; `/r/[shareToken]` renders the report read-only if the share row exists and is not revoked/expired. **Off by default; sharing is an explicit, revocable admin action**, this preserves "you control who sees it" while enabling the practical "send it to a board member without an account" case.

---

## 10. Pages & flows (behavioral spec)

- **`/` landing**, public marketing page. Hero states the thesis (find the one broken thing; the chain), how-it-works in three steps, a Get started CTA. Follow the prototype's content and register.
- **`/get-started`**, church profile form (the fields in §4). Auth-gate it: if not signed in, send through magic-link, then return here. On submit, call `create_church_with_admin`, resolve + store `brand_color`, create the `assessment_runs` row, redirect to the dashboard.
- **`/app/[churchId]` dashboard**, branded header (monogram tile + name), completion progress, the eight category cards (chain-position glyph, status, assigned respondents including multiple per category, invite + answer-yourself actions), a "Manage access" entry, and a "View diagnosis" affordance. Mirror the prototype.
- **`/respond/[token]`**, the questionnaire the invited leader sees: branded with the church they're helping, the anchored 1–10 items for one category, an honesty preamble, and a permission note that they won't see results. On submit → thank-you screen with the confidentiality explanation. No results, ever.
- **`/app/[churchId]/report`**, the diagnosis, members only.

---

## 11. Environment & config

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only; used ONLY in /api/respond/*
ANTHROPIC_API_KEY=                # server only
ANTHROPIC_MODEL_PROSE=claude-sonnet-5
ANTHROPIC_MODEL_CLASSIFY=claude-haiku-4-5
PROSE_MODE=ai                     # ai | fallback
RESEND_API_KEY=
EMAIL_FROM="Cairn <assess@yourdomain>"
APP_URL=https://…
MONOGRAM_LETTERS=1                # 1 | 2
```
Verify current model strings against the Anthropic models docs before deploy, strings move with releases. Keep them in env so a change is a config edit, not a code change.

---

## 12. Design tokens (carry the prototype's identity)

```
--paper:#FBF9F5  --ink:#1A1C22  --ink-soft:#565962  --line:#E4DED3
--berry:#8E2B3E  (RESERVED: diagnosis/constraint/active only)
--berry-deep:#6E1F30  --sage:#4E6B60 (healthy/enabler)  --sand:#EEE8DD
Display/scores: Fraunces.  UI/body: Hanken Grotesk.
Monogram tile palette (8, none berry): deep teal, slate blue, forest, plum,
  ink-navy, oxblood-brown, bronze, charcoal-green.
Signature motif: the chain glyph (five dots, filled to the current stage, berry = the break).
```
Quality floor: responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected. No browser storage, server + Postgres are the state.

---

## 13. Build sequence (build and verify one milestone at a time)

Do not proceed to the next milestone until the current one meets its acceptance criteria.

- **M0: Scaffold.** Next.js + Supabase wired, env loaded, tokens + fonts, one styled page. *AC: app runs locally; landing renders with the type system.*
- **M1: Methodology + Engine (do this before any DB).** `questions.yaml` populated from the Frameworks doc; pure engine; fixtures. *AC: `npm test` green on all six fixtures; engine imports nothing from Next/Supabase/network; a fixture renders a full report with `PROSE_MODE=fallback`.*
- **M2: Schema + RLS + Auth.** Migrations, RLS policies, magic-link auth, `create_church_with_admin`. *AC: RLS tests prove a non-member cannot read any of a church's runs/responses/diagnoses/invitations; creator is admin; anon cannot select invitations or responses.*
- **M3: Profile + Dashboard + Branding.** Church creation, `resolveBrand`, dashboard with category cards and status. *AC: create a church; monogram + tile color render and persist; categories list with correct chain glyphs and statuses.*
- **M4: Invite + Respond.** Invite creation + email; the two scoped respond handlers; questionnaire; thank-you. *AC: send an invite; open the tokenized link in a fresh incognito session; answer and submit; thank-you shows; the token exposes zero results; a used or expired token is rejected; a second invite to the same category works.*
- **M5: Diagnosis + Report + AI + PDF + Permissions.** Deterministic diagnosis, report UI, prose (AI + fallback), PDF, manage-access. *AC: report renders for admin/viewer only; `PROSE_MODE=fallback` still renders the full report; dispersion appears when two people answer a category; adding/removing a viewer changes who can load the report; PDF downloads.*
- **M6: Landing + Share + Polish.** Marketing landing, opt-in share links, responsive/a11y pass. *AC: public landing complete; a share link renders read-only and stops working when revoked; mobile + keyboard + reduced-motion verified.*

---

## 14. Explicitly OUT of scope for v1 (do not build)

- Benchmarking database (use `benchmarks.yaml` priors; note them as priors in the report).
- Logo upload (monogram only; leave the nullable column).
- Multiple runs / historical re-assessment UI (schema allows it; UI is later, but keep `Outcome`/re-assessment in mind so it's not painful later).
- The 90-Day Giving Challenge (separate product).
- Denominational tuning of benchmarks (cohort by size only in v1).
- Payment/billing (the assessment is free).
- Any analytics surface beyond the report itself.

---

## 15. Security checklist (verify before deploy)

- [ ] RLS enabled on every table; default-deny; member-gated selects; admin-gated member writes.
- [ ] No `/lib/supabase/service.ts` exists and no service-role key is used anywhere; the two `/api/respond/*` handlers run on the anon-key client (RLS) via SECURITY DEFINER RPCs.
- [ ] Service-role key and `ANTHROPIC_API_KEY` never referenced in any client component or `NEXT_PUBLIC_*` var.
- [ ] Invitation tokens and share tokens are unguessable UUIDs; invitations expire; share links are opt-in, revocable, and can expire.
- [ ] Respond handlers validate token status/expiry and validate every submitted value (int 1–10, item belongs to category).
- [ ] Rate limiting on `/api/respond/*` and `/api/invitations`.
- [ ] No results, scores, or church internals ever returned on any anon path.
- [ ] A non-member hitting `/app/[churchId]/report` is denied by RLS, not just redirected by the UI.
```
