# Cairn — M3: App Shell + Auth + Profile / Dashboard / Branding (design)

**Date:** 2026-07-15 · **Status:** Approved by user 2026-07-15. Follows M2 (Schema + RLS + Auth SQL, shipped `7d26b07`). No code written yet.
**Source of truth (technical):** `docs/XPG-Engineering-Spec.md` (§2 auth, §3 branding, §4 schema/RLS, §10 pages, §12 tokens, §13 milestones).
**Companion decision doc:** `docs/superpowers/specs/2026-07-15-invited-leader-accounts-design.md` (auth/actor model).

---

## 0. Why this milestone, and the finding that reshaped it

Two corrections to the prior "M4 is next" assumption, established by reading the roadmap against the actual codebase:

1. **The next milestone per Engineering Spec §13 is M3, not M4.** M3 = **Profile + Dashboard + Branding**. M4 (Invite + Respond, incl. the `/api/respond/*` service-role handlers) comes *after* M3. M6 is the `report_shares` share flow.

2. **The Next.js app does not exist yet.** As of `7d26b07` the repo is a pure TypeScript library + SQL:
   - `package.json` deps are only `js-yaml` + `zod` — no `next`, `react`, `@supabase/*`, `@anthropic-ai/sdk`, Resend, or Tailwind.
   - No `/app` directory, no Next config, no `.env`, no auth wiring.
   - `lib/` holds only the pure engine, methodology loader, `ai/fallback.ts`, and a **text** report renderer (`report/render.ts`, not the spec's `render.tsx`). `lib/supabase/` and `lib/brand/resolve.ts` do not exist.

   M0's Next.js scaffold + magic-link auth were deferred (the team went engine-first → DB-first). **Neither M3 nor M4 can start until that app shell + auth exist.** This milestone therefore *bundles* the deferred M0 app-shell + auth work with the roadmap's M3 content, as approved by the user ("M3 bundled").

**One-line scope:** stand up the Next.js app + Supabase auth (magic link + Google), then deliver the first clickable product — create a church, see its branding persist, and view a status-only dashboard — with the RLS permission wall proven end-to-end in a real browser.

---

## 1. Decisions locked in brainstorming (2026-07-15)

| Decision | Choice | Notes |
|---|---|---|
| Milestone structure | **M3 bundled** (app shell + auth + profile/dashboard/branding as one milestone) | First clickable product; one plan→build→review cycle. |
| Auth methods | **Magic link + Google** (no passwords, ever) | Design §9 of the auth doc keeps both open; user chose both now. |
| Dashboard extent | **Status-only** | Cards render 8 categories + chain glyphs + status. Later actions are visible-but-disabled stubs. |
| Carried item — engine coverage/completeness gate | **Defer to M5** | Pure `lib/engine` extension; not exercised until diagnosis runs. |
| Carried item — M2 SQL hardening (I1 EXECUTE-narrow, I2 negative tests) | **Defer to M4** | Cheap SQL-only; fold into M4's next Supabase work. |
| Styling | **Tailwind + §12 tokens** (recommended, approved) | Encoded as theme variables; `--berry` reserved for constraint only. |
| Google testability caveat | **Accepted** | Wire + typecheck locally; full Google round-trip verified against the cloud project at deploy (see §3). |

---

## 2. Prime directives — how M3 honors them

1. **Deterministic engine / additive AI.** M3 touches **no** engine code. `lib/engine` + `lib/methodology` stay framework-free; the engine-purity grep must remain clean. `resolveBrand` is a new *pure* function but lives in `lib/brand`, not `lib/engine`.
2. **Permission wall in Postgres RLS.** M3 is the first milestone to exercise the wall from a browser. The dashboard reads through the anon/RLS server client; a non-member is denied server-side (no rows → 404/redirect), **not** by a UI guard. No service-role client is introduced (that is M4's, for the respond handlers only).
3. **Methodology as versioned YAML.** The dashboard's 8 categories, order, and chain positions come from the loaded methodology (`lib/methodology`), not hard-coded. `methodology_version` passed to `create_church_with_admin` comes from the loaded methodology.

---

## 3. Design sections

### §3.1 — App shell & dependencies
Introduce Next.js (App Router, latest stable) + React + TypeScript over the existing repo. Add: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, Tailwind, and `next/font`. **Exact versions and the current `@supabase/ssr` + App Router auth API are to be verified via Context7 at plan-time** (per user guardrail: verify Supabase/Next specifics before locking them into the plan).

- The pure `lib/engine` + `lib/methodology` are **not** modified. `tsconfig.json` extends to cover `app/` + JSX without changing engine compilation guarantees.
- Tailwind theme encodes §12 tokens: `--paper:#FBF9F5`, `--ink:#1A1C22`, `--ink-soft:#565962`, `--line:#E4DED3`, `--sage:#4E6B60`, `--sand:#EEE8DD`, and **`--berry:#8E2B3E` RESERVED** (diagnosis/constraint/active only — never used as a brand tile or generic accent).
- `next/font` loads **Fraunces** (display/scores) + **Hanken Grotesk** (UI/body).
- `<ChainGlyph>` component: five dots, filled to the current stage, berry marks the break. In M3 all stages are "not started," so the glyph renders the chain positions without a break.

### §3.2 — Supabase clients (`lib/supabase/`)
Via `@supabase/ssr`:
- `client.ts` — browser client.
- `server.ts` — server client, cookie-based session, **anon key → RLS-enforced**.
- `middleware.ts` (repo root) — refreshes the session on navigation.
- **No `service.ts`.** The service-role client is M4's, imported only by the two `/api/respond/*` handlers (Spec §15).

### §3.3 — Auth: magic link + Google (no passwords)
- A sign-in page (magic-link email input + "Continue with Google" button).
- `/auth/callback` route handler exchanges the auth code for a session (the current `@supabase/ssr` PKCE pattern — confirm exact call at plan-time).
- Sign-out action.
- `supabase/config.toml` enables both providers; Google needs client id/secret via env (`.env` / Supabase project settings).
- **Testability caveat (documented so "untested" ≠ "broken"):** magic link is fully verifiable locally through Supabase's Inbucket mailbox (`http://127.0.0.1:54324`). Google OAuth cannot complete a real consent flow against `localhost` without test credentials, so M3 wires + typechecks the Google path and verifies the button renders and redirects to the provider; the **full Google round-trip is confirmed against the cloud project at deploy.** The magic-link path is the one proven end-to-end in M3.

### §3.4 — Branding (`lib/brand/resolve.ts`, pure)
`resolveBrand(church) → { monogram, tileColor, displayName }` per Spec §3:
- **monogram** — first letter of up to the first two *significant* words (skip stopwords `the, of, and, a, at, in, on, for`); single-word names → first letter; always uppercase. `MONOGRAM_LETTERS` config constant (`1 | 2`, default 1).
- **tileColor** — deterministic hash of the church name → index into the fixed 8-tone palette (deep teal, slate blue, forest, plum, ink-navy, oxblood-brown, bronze, charcoal-green). **Never berry `#8E2B3E`.** Resolved once at creation and stored as `churches.brand_color` (stable if the palette later changes).
- **displayName** — the church name, trimmed.

Pure function, no framework/db/network imports → **vitest unit tests** in the existing style.

### §3.5 — Church creation (`/get-started`)
Auth-gated. If not signed in, route through sign-in and return. Form fields per Spec §4 `churches` (name, denomination, context, attendance/adults/staff_fte/budget/church_age bands, growth_trajectory). On submit:
1. `resolveBrand(name)` → `brand_color`.
2. Call the M2 RPC (already built + pgTAP-tested), signature confirmed from `20260715000200_rpc_create_church.sql`:
   ```
   create_church_with_admin(
     p_name text, p_brand_color text, p_methodology_version text,
     p_denomination text=null, p_context text=null, p_attendance_band text=null,
     p_adults_band text=null, p_staff_fte_band text=null, p_budget_band text=null,
     p_church_age_band text=null, p_growth_trajectory text=null, p_logo_url text=null
   ) returns table(church_id uuid, run_id uuid)
   ```
   The RPC atomically inserts the `churches` row (with `brand_color`), the `church_members(admin)` row, and the first `in_progress` `assessment_runs` row, and returns `(church_id, run_id)`. The client passes `p_methodology_version` from the loaded methodology.
3. Redirect to `/app/[church_id]`.

`brand_color` is resolved in the app layer (TypeScript) and passed in — the RPC does not compute it. `logo_url` stays null (monogram-only in v1).

### §3.6 — Dashboard (`/app/[churchId]`, Server Component, status-only)
Reads church + membership + run status through the RLS server client. Renders:
- Branded header — monogram tile (`brand_color` bg, white text) + church name.
- Completion progress.
- **8 category cards** from the loaded methodology (guest, conn, disc, vol, gen stages; gov, comm, sys enablers) — each with its chain-position glyph and status (all **"not started"** in M3).
- **Disabled stubs** for later actions, each labeled with its milestone: invite (M4), answer-yourself (M4), view-diagnosis (M5), manage-access (M5).

**Permission wall:** a signed-in user with no `church_members` row for this church gets no rows from the RLS read → the route returns **404 / redirect, denied server-side by RLS** (not a UI guard). This is the first browser-level proof of the wall.

### §3.7 — Testing & verification
- **Unit (vitest):** `resolveBrand` — monogram (stopwords, single-word, both `MONOGRAM_LETTERS` values), `tileColor` determinism + never-berry, `displayName` trim. Runs in the existing vitest suite.
- **End-to-end (real browser, per `verification-before-completion`):** magic-link sign-in via Inbucket → create a church → `brand_color` persists + monogram/tile render → dashboard lists 8 categories with correct chain glyphs → **a signed-in non-member is denied** another church's dashboard. Playwright is available for the RLS-denial path if a scripted check is wanted.
- **Gates (all must stay green):** `npx vitest run` (existing 75 + new brand tests), `npm run typecheck` = 0, `npm run test:db` still green (M3 adds **no** SQL migration or pgTAP test), engine-purity grep on `lib/engine` clean, plus `next build` + lint succeed.

### §3.8 — Explicitly deferred (YAGNI), with target milestone
- Invites + the two `/api/respond/*` handlers + `lib/supabase/service.ts` → **M4**.
- Admin "answer-yourself" questionnaire (writes `responses respondent_kind='member'`) → **M4**.
- Diagnosis compute + report UI (`render.tsx`) + AI prose (`classify.ts`/`prose.ts`) + PDF + manage-access viewers → **M5**.
- Engine coverage/completeness gate (pure `lib/engine`) → **M5**.
- M2 SQL hardening I1 (EXECUTE-narrow `is_church_member`) + I2 (`churches_update` / `profiles_update_own` negative tests) → **M4**.
- Marketing landing + opt-in share links + full a11y/responsive polish → **M6**.
- Passwords — never.

---

## 4. Acceptance criteria (M3 done)

Extends Engineering Spec §13 M3 AC:
- A user signs in via **magic link** (verified locally through Inbucket); the **Google** button renders and redirects to the provider (full round-trip deferred to cloud verify).
- Creating a church via `/get-started` calls `create_church_with_admin`, and the **monogram + tile color render and persist** across a reload.
- The dashboard lists the **8 categories with correct chain glyphs and "not started" statuses**.
- A signed-in **non-member cannot load** another church's dashboard — **denied by RLS server-side**, not by a UI redirect.
- All gates green (§3.7). `test:db` unchanged (no SQL in M3).

---

## 5. Feeds `writing-plans` — build units in dependency order

1. **App shell scaffold** — Next.js App Router + React + TS over the repo; Tailwind + §12 tokens; `next/font` (Fraunces + Hanken Grotesk); base layout + one styled page; `tsconfig`/lint wired; `next build` green. (Verify Next + Tailwind versions via Context7.)
2. **Supabase clients + middleware** (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`) via `@supabase/ssr`; env template (`.env.example`) with the §11 vars minus the service-role key. (Verify `@supabase/ssr` API via Context7.)
3. **Auth** — sign-in page, `/auth/callback` handler, sign-out; `supabase/config.toml` providers (magic link + Google); magic-link e2e via Inbucket.
4. **`resolveBrand`** (`lib/brand/resolve.ts`) + vitest unit tests (TDD).
5. **Church creation** (`/get-started`) — form → `resolveBrand` → `create_church_with_admin` RPC → redirect.
6. **Dashboard** (`/app/[churchId]`) — branded header, progress, 8 status-only category cards + `<ChainGlyph>`, disabled stubs; RLS non-member denial.
7. **Verification** — full e2e browser run + all gates; final whole-branch review.

---

## 6. Guardrails carried into M3

- **Verify by running,** not reading. Baselines: `npx vitest run` = 75/75 (pre-M3), `npm run typecheck` = 0, `npm run test:db` = 6 files/72 tests, engine-purity grep clean.
- **Context7** for Supabase/Next API specifics before locking the plan (versions, `@supabase/ssr` calls, App Router auth patterns).
- Supabase CLI **pinned 2.104.0** — do not upgrade (ignore the v2.109.x nag). **PG17 accepted.** Do **not** `npm audit fix --force`.
- **Push only on explicit user go-ahead, as `MylesM18`** (repo PRIVATE `github.com/MylesM18/XPG-Church-Assess`; `nataliemagee`/`CornerLeague` accounts are pull-only → 403). Verify the active gh account before any push.
- `.superpowers/sdd/` is git-ignored scratch.
- **Cloud-deploy checklist (act at deploy):** confirm `authenticated`/`anon` roles hold base-table grants (Supabase `auto_expose_new_tables` default flipped false 2026-05-30) or RLS is moot at the grant layer; complete the Google OAuth round-trip against the cloud project.

---

## 7. Out of scope for M3 (v1 reminders from Spec §14)

Benchmarking DB (YAML priors), logo upload (nullable column stays), multiple/historical runs UI, the 90-Day Giving Challenge, denominational benchmark tuning, payment/billing, analytics beyond the report.
