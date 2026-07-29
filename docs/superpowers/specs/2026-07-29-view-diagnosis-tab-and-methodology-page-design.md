# Design — "View diagnosis" opens in new tab + public Methodology page in footer

Date: 2026-07-29
Status: Approved decisions locked (owner chose both via clarifying questions). Ready for implementation plan.

## Goal

Two independent, presentation-layer changes requested by the owner (Natalie):

1. **View diagnosis → new browser tab.** When an admin clicks "View diagnosis" on the church dashboard, the report should open in a new browser tab instead of navigating away from the dashboard.
2. **Public Methodology documentation page.** A detailed, thorough, plain-English explainer of the diagnosis process and the mechanism behind the report — so an admin understands how we calculate, weight, and measure — living on the **public landing page footer under a "Documentation" heading**.

## Locked decisions (owner-approved 2026-07-29)

- **Feature 1 behavior: NEW BROWSER TAB.** Not an in-app modal, not a popup `window.open`. Just make the existing link open in a new tab.
- **Feature 2 depth/IP: THOROUGH CONCEPT, NO EXACT CONSTANTS, PUBLIC.** Complete plain-English walkthrough of every step (what's measured, scoring, weighting toward the weakest stage, percentiles, bands, dependencies, blind spots, calibration/disagreement, the additive-AI boundary) with illustrative/worked examples — but **withhold the exact tunable numbers** (e.g. do NOT print 0.85/0.15, break/gate=45, severe=25, blind-spot gap=20, dispersion=2.0, the p25/p50/p75 tables). The page is public (in the public footer), so it must be IP-safe. Carry the "benchmarks are provisional priors, not an observed cohort" caveat.

## Feature 1 — View diagnosis in a new tab

**File:** `app/app/[churchId]/page.tsx` — the `hasDiagnosis` branch, currently ~lines 224–230:

```tsx
<Link
  href={`/app/${churchId}/diagnosis`}
  className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
>
  View diagnosis
</Link>
```

**Change:** add `target="_blank"` and `rel="noopener noreferrer"` to the `next/link`. Add a new-tab affordance and a screen-reader cue so it's not a silent context switch. The landing footer already uses a trailing `↗` convention for external/new-tab links — reuse it.

Suggested result:
```tsx
<Link
  href={`/app/${churchId}/diagnosis`}
  target="_blank"
  rel="noopener noreferrer"
  className="...unchanged classes..."
>
  View diagnosis <span aria-hidden="true">↗</span>
  <span className="sr-only"> (opens in a new tab)</span>
</Link>
```
(Confirm a `sr-only` utility exists in this repo's Tailwind setup; if not, use the project's existing visually-hidden pattern.)

**Guard test:** extend/author the dashboard page test to assert the "View diagnosis" link carries `target="_blank"` AND `rel` containing `noopener` (source-read or render assertion, matching how sibling dashboard tests are written under `tests/`). Follow the project's non-vacuity discipline (occurrence-count / presence check that survives additions).

**Out of scope for F1:** the report page itself (`/app/[churchId]/diagnosis`) is unchanged. It stays the full-page admin-only server-rendered `ReportBody`.

## Feature 2 — Public Methodology page + footer link

### Route & placement
- New public route. Recommended path: **`app/methodology/page.tsx`** (net-new; no docs route exists today). It is public — NO auth gate (mirror how `app/get-started` / landing are public; do not add a `church_members` check).
- **Footer link.** The footer is inline in `app/page.tsx` (~lines 491–527), styled by semantic classes in `app/landing.css` (~lines 1366–1424) — NOT Tailwind utilities. Add a "Documentation" grouping/link in the footer nav. Owner's words: "in the footer section under documentation." Concretely: add a footer link labelled e.g. `METHODOLOGY` (or `HOW WE SCORE`) under a `DOCUMENTATION` column/heading, using the existing `.xp-footer-nav` / `.xp-footer-link` classes so it matches. Internal link → `/methodology` (no `↗`, no `target=_blank` — it's internal).
- The unused legacy `components/marketing/site-footer.tsx` is NOT wired to anything — do not edit it; edit the inline footer in `app/page.tsx`.

### Page styling
- Match the landing aesthetic. Either reuse `app/landing.css` classes or add a small scoped stylesheet for a long-form readable document (max-width prose column, the brand fonts already loaded). Keep it a server component (static content, no client JS needed). Provide a back-to-home link and the brand monogram/header consistent with other pages.

### Content outline (thorough, plain-English, NO exact constants)
Audience: a church admin/leader. Voice: plain, confident, non-jargony; define every term the first time. Ground every claim in the ACTUAL current mechanism (see engine map reference below) but express thresholds/weights qualitatively.

Sections:
1. **What this assessment is** — a diagnosis, not a scorecard. It finds the earliest place your ministry "chain" breaks and tells you where to focus (and where NOT to yet).
2. **What we measure** — eight areas: five sequential **stages** (Guest Experience → Connection → Discipleship → Volunteering → Generosity) and three **enablers** (Governance/Accountability, Communication, Org Structure/Systems). Each area is measured by a small set of anchored 1–10 questions, each anchored at 1 / 5 / 10 so ratings mean the same thing to everyone. Questions are tagged as **belief** ("what you think is true") vs **evidence** ("what's actually happening") — this powers blind-spot detection.
3. **How a score is formed** — answers are on a 1–10 scale; an area's score is the average of its questions rescaled to 0–100. We separate the area's true level from individual raters' tendencies (some people rate harshly, some generously) so a score reflects the area, not the rater. We only count a respondent toward an area when they've answered ALL of that area's questions, so partial responses can't skew it. (Do NOT expose the two-way-fit formula constants.)
4. **The two headline numbers** — **Capacity** (how you're doing on average across all eight areas) and **Throughput** (how well the whole chain actually moves people all the way through — weighted heavily toward your weakest stage, because a chain is only as strong as its weakest link). The **gap** between Capacity and Throughput reveals hidden drag: lots of individual strength that isn't translating into end-to-end flow. (Do NOT print the 0.85/0.15 weighting; describe it as "weighted heavily toward the weakest stage.")
5. **The chain & dependencies** — stages are read in order; the FIRST stage that breaks is your **primary constraint** — the one thing to fix first. Breaks further down the chain are "don't work on these yet" (they're often downstream symptoms). Enablers don't get a headline; they **gate** the fix (weak governance/comms/systems can block progress). Describe the dependency "reads" in plain words: a dependency can be *load-bearing* (both ends weak — actively costing you), *clear* (upstream strong, so it's not the explanation), *at-risk* (running on borrowed time), or *quiet* (both strong — nothing to flag). (Do NOT print the break threshold number.)
6. **Benchmarks & bands** — scores are placed against churches of similar weekly attendance, and reported as a band (e.g. Severe / Broken / Watch / Strong) plus a rough percentile. **Caveat (required):** these benchmarks are currently *provisional working priors*, not yet an observed cohort — so read percentiles directionally, not as precise rankings. (Do NOT print the p25/p50/p75 tables or the band cutoff numbers.)
7. **Blind spots (belief vs evidence)** — when belief runs well ahead of evidence, that's a blind spot; when evidence is ahead of belief, you may be underrating yourselves. (Do NOT print the gap threshold.)
8. **Agreement & confidence** — we adjust for rater style before checking whether people genuinely disagree, and we flag real disagreement. We also lower confidence when an area rests on very few responses. (Qualitative only.)
9. **The role of AI** — the verdict is decided by a deterministic engine; AI only rephrases the already-decided findings into readable prose and is fact-checked against the numbers. No model call ever changes a score or a verdict.
10. **Versioning & honesty** — the methodology is versioned; thresholds and benchmarks are tunable and being refined as real data arrives. Link back to booking a call if they want to talk through their results.

### Guard tests
- Footer test: assert the landing footer renders a link to `/methodology` under/labelled "Documentation".
- Methodology page test: source-read/render assertion that the page renders and contains the key section headings (e.g. "What we measure", "chain", "blind spot", "benchmarks", the provisional-benchmark caveat). Also an **IP-safety guard** (per project non-vacuity discipline): assert the rendered page text does NOT contain the exact proprietary constants — e.g. no "0.85", no "break: 45", no "dispersion", etc. This keeps future edits from leaking IP into the public page.

## Engine map reference (ground the copy against this — do NOT re-derive)

The full, verified mechanism map (with exact file:line and constants) produced this session is saved at:
- Workflow journal: `/Users/newmac/.claude/projects/-Users-newmac-Desktop/8d5a9776-035d-4746-a8c4-df484c28cbab/subagents/workflows/wf_988ed865-2da/journal.jsonl` (5 `result` lines — search for area containing "diagnosis computation").
- The authoritative in-repo sources to quote conceptually: `methodology/rules.yaml` (chain, enablers.gates, weights, thresholds, 13 dependency statements), `methodology/questions.yaml` (8 categories, belief/evidence tags, anchors), `methodology/benchmarks.yaml` (provisional priors caveat), `methodology/copy.yaml` (ready-made lay phrasings — reuse these for tone), `docs/Cairn-Eight-Category-Frameworks.md` (best plain-language adaptation base), `docs/2026-07-27-diagnosis-report-reform-design.md` (the CURRENT mechanism — supersedes older spec §7), `lib/engine/*` (fit.ts, throughput.ts, benchmark.ts, constraint.ts, dependencies.ts, gap.ts, assemble.ts).

Key numbers to KEEP OUT of the public page: throughput min_weight 0.85; break=45, severe=25, gate=45, blind_spot_gap=20, dispersion=2.0; correlation min_n=18 / floor 0.5; the p25/p50/p75 benchmark tables; confidence 0.15/0.4.

## XPG standing guardrails (apply)

- ⛔ Agent NEVER runs `npm run test:db`, `supabase db push|reset`; NEVER merges/pushes to `master`; never force-pushes — all owner-gated. This work is presentation/copy only → **NO migration, NO db push, NO test:db.**
- Guard-first TDD, ONE change at a time, commit per change with explicit `git add <path>` (never `git add .`, never stage `.claude/`).
- Use `GIT_LITERAL_PATHSPECS=1` for paths containing `[churchId]` / `[categoryId]` brackets.
- **No new dependencies.** Build the new-tab change and the methodology page with what's already in `package.json` (Next 16, React 19, Tailwind, no UI lib).
- Gates before commit: `npm run typecheck` (0), `npm run lint` (0), `npm run test` / vitest (all pass; current floor ~488 — raise the floor as guards are added).
- Branch off the latest `master` — do NOT build on `feat/dependency-map-boxed-rows` (that's PR #38, pending owner merge). Re-check PR #37/#38 state first (`gh pr view 38`).
- PR is owner-gated: open the PR, do NOT merge; Natalie reviews (a public-page + dashboard browser glance) then merges.

## Out of scope
- Any change to the report page content or the scoring engine itself.
- Any auth/gating of the methodology page (owner chose public).
- Real (observed) benchmarks — still blocked on n≥200 by design.
