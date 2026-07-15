# Cairn — Brainstorm Decisions & M1 Direction
**Date:** 2026-07-14 · **Status:** Decisions locked; M1 plan pending. No code written yet.

This is the outcome of the brainstorming pass over the three source docs in `./docs`:
- `Cairn-Eight-Category-Frameworks.md` — methodology content (questions, anchors, scoring, chain, blind-spots, offers). **Source of truth for assessment content.**
- `XPG-Engineering-Spec.md` — technical source of truth (repo shape, RLS, engine pipeline, AI calls, milestones M0–M6).
- `Cairn-Church-Health-Assessment-Prototype.html` — design/product artifact (the working prototype).

> ⚠️ **Missing doc:** the Engineering Spec references a companion `XPG-Church-Health-Assessment-Build-Spec.md` (product rationale). It was **not provided**. The prototype HTML stands in as the product/design artifact. Ask the user for the Build-Spec if product-rationale questions arise.

---

## The three prime directives (never trade away)
1. **Deterministic engine, additive AI.** `diagnose(responses, methodology): Diagnosis` is pure — no imports from Next/Supabase/network. No model call decides any number or verdict. Report must render fully with `PROSE_MODE=fallback`.
2. **Permission wall in Postgres (RLS), not the UI.** Default-deny + membership. Service-role key lives ONLY in the two `/api/respond/[token]` handlers.
3. **Methodology is versioned data** under `/methodology/*.yaml`, not TypeScript. Every diagnosis stamped with `methodology_version`.

Build order: M0 scaffold → **M1 methodology + pure engine + 6 fixtures (BEFORE any DB)** → M2 schema/RLS/auth → M3 profile/dashboard/branding → M4 invite/respond → M5 diagnosis/report/AI/PDF/permissions → M6 landing/share/polish. Verify each milestone's ACs; stop and wait for user go-ahead between milestones.

---

## Decisions locked this session
1. **Thresholds** → adopt the spec's provisional `rules.yaml` values as v0.1 tunable calibration knobs: `break: 45, severe: 25, gate: 45, blind_spot_gap: 20, dispersion: 2.0`. They live in YAML (data), retuned when XPG calibrates against 10 real churches. Fixtures are built around these numbers.
2. **Benchmarks** → Frameworks doc has NO benchmark numbers. Claude drafts a **clearly-labeled placeholder prior set** ("XPG priors v0 — provisional, not observed") covering per-attendance-band percentiles for all 8 categories, for user sign-off. The report must visibly state scores are benchmarked against priors, not a real cohort. `source:` field in `benchmarks.yaml` says so.
3. **belief/evidence item tagging** → Claude derives the tag for every item from the spec's guidance + the Frameworks blind-spot triggers, then presents the full 8-category mapping in the design doc for user sign-off before it's locked. Working derivation (to confirm): **evidence** = G1,G2,G4,G5, C2,C3,C5, D3, V1,V2, GEN1 ; the rest **belief**. (disc has no/weak evidence items → per rules.yaml #6 it can only be primary if it's the earliest break, else "contributing".) NEEDS SIGN-OFF.
4. **Design identity** → user consciously chose **"literal wembi.ai clone + XPG colors,"** overriding prime-directive #4 (the prototype's paper/ink/berry/sage + Fraunces/Hanken identity). Implication: a real deep-dive of **wembi.ai** (UI/UX to replicate) and **xpgathering.com** (brand colors/style/imagery) is an M0/M3 task, plus pulling imagery from xpgathering.com and unsplash.com (community/church). **Mobile-first, then desktop.** Keep the engine's *semantic* color meaning (constraint/broken vs healthy/enabler) but express it in the XPG palette. This is a UI concern — does NOT block M1 (pure engine).

---

## ⚠️ OPEN DECISIONS for next session (resolve BEFORE M2; none block M1)
1. **Invited-leader accounts (BIGGEST).** User now wants *everyone* — exec AND invited leaders — to **sign up + create a profile/account**; "the Church's profile is unique to the exec profile." This conflicts with Engineering Spec §2 ("Invited leaders never authenticate — no account") and touches prime-directive #2. **Reconciliation to propose:** invited leaders MAY have a login/profile, but having an account ≠ church membership; RLS still forbids any non-member (incl. logged-in invited leaders) from reading a church's runs/responses/diagnoses/invitations. The tokenized `/respond/[token]` flow can still be the answer surface, OR shift to an authenticated respond flow — decide which. This reshapes M2 (auth/profiles table) and M4 (respond). Get explicit user confirmation on the reconciliation before building M2.
2. **`profiles` table.** User's phrasing implies a user-profile entity distinct from `church_members`. Spec doesn't have one. Likely add a `profiles` table (1:1 with `auth.users`: name, role, contact) so both execs and invited leaders have profiles. Confirm shape at M2.
3. **belief/evidence mapping** sign-off (see decision #3 above) — do at start of M1 design-doc review.
4. **Benchmark prior values** sign-off — do when M1 `benchmarks.yaml` is drafted.
5. **Missing Build-Spec** — request from user if product-rationale gaps appear.

---

## M1 scope (propose plan next, then build — engine before any DB)
Populate `/methodology` from the Frameworks doc and build the pure engine + 6 fixtures.
- `methodology/questions.yaml` — all 8 categories, every item's text + lo/mid/hi anchors **verbatim** from Frameworks doc, each tagged `belief|evidence` and `signal`. Categories: guest, conn, disc, vol, gen (stages 1–5); gov, comm, sys (enablers).
- `methodology/rules.yaml` — chain order, enabler gates (gov→all, comm→[guest,conn], sys→[vol,disc]), generosity breadth `[GEN1]` / depth `[GEN2,GEN4]`, thresholds (above), constraint_logic (8 steps), confidence.
- `methodology/benchmarks.yaml` — labeled placeholder priors (all 8 cats × bands).
- `methodology/copy.yaml` + `offers.yaml` — fallback prose templates + offer mapping (generosity → 2 offers by breadth/depth) verbatim-ish from Frameworks "Offer" sections.
- `lib/engine/`: `normalize → score → gap → benchmark → constraint → dispersion → assemble`, `types.ts`, `index.ts` exporting `diagnose(responses, methodology): Diagnosis`. **Imports nothing from Next/Supabase/network.**
- `lib/methodology/load.ts` — load + schema-validate YAML, fail loudly.
- `tests/engine/` — 6 fixtures with expected diagnoses: **Leaky Bucket, Faithful Remnant (breadth), Broad-but-Shallow (depth), Founder Bottleneck (gov gate), Disagreement (dispersion), Healthy Church (NO_STRUCTURAL_CONSTRAINT — must NOT manufacture a constraint).**
- **M1 AC:** `npm test` green on all 6 fixtures; engine imports nothing framework/db/network; a fixture renders a full report with `PROSE_MODE=fallback`.

Engine env/config to honor later: `ANTHROPIC_MODEL_PROSE=claude-sonnet-5`, `ANTHROPIC_MODEL_CLASSIFY=claude-haiku-4-5`, `PROSE_MODE=ai|fallback`, `MONOGRAM_LETTERS=1`. Verify model strings via Anthropic docs before deploy.

## Working method
Use superpowers: brainstorming (this pass) → writing-plans (M1 plan) → subagent-driven-development / TDD to build. Verify by running, not by reading. Small, reviewable commits per milestone. This project dir is not yet a git repo — `git init` at M0.
