# "View diagnosis" new tab + public Methodology page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax. Guard-first, one change per commit.

**Goal:** Make the dashboard "View diagnosis" link open in a new browser tab, and add a public plain-English Methodology page linked from the landing footer — both presentation-only.

**Architecture:** F1 adds `target="_blank"` + `rel="noopener noreferrer"` + a `↗` affordance and sr-only cue to the existing `next/link` on the admin dashboard. F2 adds a new public server-component route `app/methodology/page.tsx` (design-token Tailwind, no client JS, no auth) and a "DOCUMENTATION → METHODOLOGY" link in the inline landing footer (`app/page.tsx` + one `.xp-footer-heading` class in `app/landing.css`). The page explains the diagnosis mechanism qualitatively, withholding proprietary constants.

**Tech Stack:** Next 16 (App Router), React 19, Tailwind v4 (design-token utilities), vitest 2 (node-env source-read guards, matching `tests/dashboard/sign-out-button.test.ts`).

## Global Constraints

- Presentation/copy only — NO migration, NO `supabase db push`, NO `npm run test:db`.
- No new dependencies (build with Next 16 / React 19 / Tailwind already in `package.json`).
- Guard-first TDD, ONE change per commit; explicit `git add <path>` only (never `git add .`, never stage `.claude/`).
- Use `GIT_LITERAL_PATHSPECS=1` for the `app/app/[churchId]/page.tsx` path (brackets).
- Gates before each commit: `npm run typecheck` (0), `npm run lint` (0), `npx vitest run` (all pass; floor ~488, raise as guards land).
- IP withholding on the public page — NEVER print: `0.85`, `0.15`, `0.4`, break/gate `45`, severe `25`, blind-spot gap `20`, `dispersion`/`2.0`, correlation `min_n`/`18`, or the `p25`/`p50`/`p75` benchmark tables. Keep the "benchmarks are provisional priors, not an observed cohort" caveat.
- PR is owner-gated: open it, do NOT merge (Natalie reviews the public page + dashboard, then merges).

---

## Task 1: F1 — "View diagnosis" opens in a new tab

**Files:**
- Test: `tests/dashboard/view-diagnosis-new-tab.test.ts` (create)
- Modify: `app/app/[churchId]/page.tsx:224-230` (the `hasDiagnosis` `<Link>`)

- [ ] **Step 1: Write the failing guard test** — source-read (node env), comment-stripped, matching the sign-out test. Assert the diagnosis link block carries `target="_blank"` and a `rel` containing `noopener`, plus the sr-only "opens in a new tab" cue; non-vacuity via a scoped slice around `href={`/app/${churchId}/diagnosis`}`.
- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run tests/dashboard/view-diagnosis-new-tab.test.ts`).
- [ ] **Step 3: Implement** — add `target="_blank"`, `rel="noopener noreferrer"`, ` <span aria-hidden="true">↗</span>` and `<span className="sr-only"> (opens in a new tab)</span>` to the diagnosis `<Link>`; classes unchanged.
- [ ] **Step 4: Run test — expect PASS**; then full suite.
- [ ] **Step 5: Gates** (typecheck, lint, vitest) then commit `git add tests/dashboard/view-diagnosis-new-tab.test.ts "app/app/[churchId]/page.tsx"` with `GIT_LITERAL_PATHSPECS=1`.

## Task 2: F2a — Footer "Documentation → Methodology" link

**Files:**
- Test: `tests/landing/footer-documentation-link.test.ts` (create)
- Modify: `app/page.tsx:493-521` (add a third `.xp-footer-nav` column)
- Modify: `app/landing.css` (add `.xp-footer-heading`)

- [ ] **Step 1: Failing test** — source-read of `app/page.tsx`; assert footer contains a `DOCUMENTATION` heading and an internal link to `/methodology` labelled `METHODOLOGY`, and that the methodology link is NOT `target="_blank"` (internal). Non-vacuity: assert the `/methodology` href occurs exactly once.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — add a new `<div className="xp-footer-nav">` with `<span className="xp-footer-heading">DOCUMENTATION</span>` + `<Link href="/methodology" className="xp-footer-link">METHODOLOGY</Link>`; add `.xp-footer-heading` (muted mono label) to `app/landing.css` under the Footer section.
- [ ] **Step 4: Run test — PASS**; full suite.
- [ ] **Step 5: Gates then commit** `git add tests/landing/footer-documentation-link.test.ts app/page.tsx app/landing.css`.

## Task 3: F2b — Public Methodology page

**Files:**
- Test: `tests/methodology/methodology-page.test.ts` (create)
- Create: `app/methodology/page.tsx` (public server component)

- [ ] **Step 1: Failing test** — source-read of `app/methodology/page.tsx`. Positive: contains the ten section anchors/headings (What this assessment is / What we measure / How a score is formed / two headline numbers / chain & dependencies / Benchmarks & bands / Blind spots / Agreement & confidence / role of AI / Versioning) and the provisional-benchmark caveat phrase, and a back-to-home link `href="/"`. IP-safety negative: assert the source does NOT contain `0.85`, `0.15`, `dispersion`, `2.0`, `p25`, `p50`, `p75`, `blind_spot`, `min_weight`, `min_n`.
- [ ] **Step 2: Run — FAIL** (module missing).
- [ ] **Step 3: Implement** the page — server component, design-token Tailwind (`font-display`/`font-body`/`text-ink`/`text-ink-soft`/`bg-paper`/`border-line`), max-width prose column, brand wordmark header + back-to-home, ten sections in plain English grounded in `methodology/*.yaml` but qualitative (no constants). Include `export const metadata`.
- [ ] **Step 4: Run test — PASS**; full suite.
- [ ] **Step 5: Gates then commit** `git add tests/methodology/methodology-page.test.ts app/methodology/page.tsx`.

## Task 4: Commit the spec + plan, open the PR

- [ ] Commit `docs/superpowers/specs/2026-07-29-...-design.md` + this plan (explicit paths).
- [ ] Push branch; open PR (owner-gated, do NOT merge). Body summarises F1/F2 + an owner browser-glance checklist (dashboard new-tab link; footer link; /methodology page renders + reads well + no constants).

## Self-review
- Spec coverage: F1 (§Feature 1) → Task 1; footer link (§Feature 2 route/placement) → Task 2; page + 10 sections + IP-safety guard + caveat (§Feature 2 content/guards) → Task 3. ✓
- No placeholders: each task has concrete files, assertions, and implementation notes.
- Type consistency: no shared types introduced; source-read guards only.
