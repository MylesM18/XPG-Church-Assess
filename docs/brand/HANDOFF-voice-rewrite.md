# Handoff — XPG report voice rewrite (PR #67)

Written 2026-08-16. The session that did this work ran out of context; everything below is state,
not plan.

## Where things stand

**PR [#67](https://github.com/MylesM18/XPG-Church-Assess/pull/67) is open and pushed.** Branch
`feat/report-xpg-voice-rewrite`, based on `master` at `d6df45b`. Two commits:

| commit | scope |
|---|---|
| `49a9a9c` | copy layer — `copy.yaml`, `report.yaml`, `SYSTEM_PROMPT`, the `OVERALL` hero label |
| `725060d` | reader-facing vocabulary in TypeScript — band names, tier names, stat labels, offer hooks, booking CTA |

**Verified green at `725060d`:** 1458 tests pass · `npx tsc --noEmit` clean · `npm run lint` clean.

Nothing is merged. `master` is untouched, still `d6df45b`.

## What was done and why

Natalie asked for three things: rewrite the report's language to the XPG brand voice, remove
duplicate phrasing, and put "Overall" next to the hero score. All three are done. She then asked
whether "Strained" was brand language (it wasn't), which produced the second commit.

The governing document is `docs/brand/xpg-voice.md` — the distilled brand voice plus a completed
audit, committed in this PR because `report.yaml` and `prose.ts` now cite it.
`docs/brand/xpg-voice-rewrite-proposal.md` records the string-by-string proposal Natalie approved.

**Do not re-read the source PDF** (`~/Desktop/XPG Church Health Assessment Guide (1).pdf`). It is 38
pages of images and will consume an entire context window. The distillation has everything.

### Decisions taken, with reasons (so they are not silently reversed)

1. **Em-dashes are banned and the copy complies.** `style_spine` and `SYSTEM_PROMPT` already said
   "No em-dashes" while `copy.yaml` used them heavily, so the AI reword path and the deterministic
   fallback punctuated the same report differently. `tests/methodology/copy-register.test.ts`
   enforces it across `copy.yaml`, `report.yaml`, `offers.yaml`, `rules.yaml` tiers and the booking
   CTA constant. Scoped to parsed values, not raw bytes — YAML comments may still use them.
2. **Tier ids and thresholds untouched; only `name:` display strings moved.** `Strained` →
   `Growth Constrained`, `At Risk` → `Strategic Priority`. No migration, no dashboard change.
3. **`holding` deliberately diverges between the two band-label maps** — `'Strong'` in `view.ts`
   (Natalie's explicit call in the visual-overhaul round; reads better in a table cell) vs
   `'Strength'` on chart labels. Synonyms, not a contradiction. Both maps carry a comment pointing
   at the other.

## Traps in this area of the codebase

- **The audit only covered `methodology/*.yaml`.** The sharpest verdict language lived in
  TypeScript. When auditing copy here, grep the render layer too.
- **Two label maps exist for the same bands**: `BAND_NAME` (`lib/report/charts.ts`) and
  `READING_BAND_LABEL` (`lib/report/view.ts`). Move them together or the dossier contradicts the
  chart for the same area.
- **Vitest does not typecheck.** `CoverStripSeg.name` restated `BAND_NAME`'s union by hand; after
  the rename the full vitest suite passed green and only `tsc --noEmit` caught it. It now derives
  from `BAND_NAME`. Always run both.
- **`banned_phrases` are keyed to the current archetype thesis sentences.** Rewriting a thesis
  without moving its ban silently breaks gate family 3. Each list must also be checked against the
  new templates so no archetype trips its own ban — that is why `s2.foundation` says "The stages are
  each doing their part" rather than "every stage is carrying its load".
- **The two `section-gates` mutation-isolation tests need a phrase with a specific property**, not
  just a new string: the FOUNDATION case must use a phrase in `banned_phrases.constraint` but NOT in
  `banned_phrases.foundation`, or it stops proving the sub-70 loop is reachable.
- **`lib/ai/section-gates.ts:40`** hardcodes `SCALE_DENOMINATOR` against the "out of 100" phrasing.
  It was kept verbatim everywhere, so no change was needed. Reword that scale phrase and this must
  move with it.
- **`passesFactCheck`** (`lib/ai/prose.ts`) pins numbers per field; moving a number between blocks
  routes every report to deterministic prose.
- **`lib/ai/fallback.ts:18`** `interp` leaves unknown `{tokens}` literal, so a block template must
  never gain a token its call site does not supply.
- **`SYSTEM_PROMPT` and `style_spine` are word-for-word in sync**, minus "name strengths before
  gaps" — that prompt rewords fields one at a time and cannot control their order.

## Outstanding

1. **Greptile Review was still `in_progress`** at last check, with zero inline comments. A clean
   Greptile pass creates no review object, so confirm from
   `gh api repos/MylesM18/XPG-Church-Assess/commits/<sha>/check-runs` plus
   `gh api repos/MylesM18/XPG-Church-Assess/pulls/67/comments` — not from the PR page. Note the
   check-runs must be queried against `725060d`, not `49a9a9c`. `Vercel`/`UNSTABLE` on this repo is
   a known permissions artifact, not a code failure.
2. **No real report has been rendered through the new copy.** Both `version` fields went to
   `0.2.0`, which is in the cache key, so every report regenerates on merge. Someone should render
   one real church on the preview deploy before merging. This needs Natalie — the report page is
   behind auth and agents do not run auth round-trips on this repo.
3. **Nothing is merged.** Natalie merges; the agent does not.

## Requested next — four changes, not yet started

Natalie reviewed a rendered report on 2026-08-16 and asked for these. **None are implemented.** Do
them on `feat/report-band-tier-vocabulary` before opening the PR, or as a follow-up PR if that one
has already gone up.

### 1. s9 — collapse repeated dependency reads

The dependency map emits one read sentence per edge, and a healthy church gets
`"Both are strong. Nothing to flag here."` **14 times in a row**. Say it once.

Source: `methodology/copy.yaml` `dependency_reads.both_strong`, interpolated at
`lib/report/view.ts:353` and `lib/report/facts.ts:234`.

The fix is de-duplication at render, not a copy change — identical consecutive read sentences should
collapse to a single bullet. Decide deliberately whether to (a) drop duplicate sentences entirely,
or (b) keep one and summarise the count. Both surfaces (`system.tsx`, `pdf/document.tsx`) read from
the same `view.ts` seam, so fix it there and both inherit it.

### 2. s10 — drop the redundant "30 DAYS / 60 DAYS / 90 DAYS" caption

Each roadmap phase renders a large `30` / `60` / `90` numeral **and** a small-caps `30 DAYS` label
beside it. The numeral already says it. Keep the numeral, change the caption to just `DAYS`.

Not yet located — it is a roadmap phase component under
`app/app/[churchId]/diagnosis/report/` (likely `web-visuals.tsx` or `sections.tsx`) with a PDF
counterpart in `lib/report/pdf/`. Change both or they drift.

### 3. s11 — stop repeating the identical offer three times

"Where XPG can partner" prints the same `call_type — hook` for 30/60/90 whenever all three phases
map to the same offer, which is every capacity-archetype report:

> 30 days: Capacity & Next-Ceiling Session — Nothing here is limiting you yet…
> 60 days: Capacity & Next-Ceiling Session — Nothing here is limiting you yet…
> 90 days: Capacity & Next-Ceiling Session — Nothing here is limiting you yet…

When the phases resolve to one offer, render it once rather than three times. Note the em-dash in
the rendered output above comes from the **renderer's** `—` separator, not from `offers.yaml` —
that hook was already rewritten. Fix the separator too while in there; the guard test does not see
renderer-side punctuation.

### 4. Remove the appendix ("Methodology and caveats", section 13) from web AND PDF

Natalie: remove it entirely. This is the largest of the four — it is a whole section, so it reaches
further than a copy edit:

- `methodology/schema.ts:244` — `appendix: ReportSectionSchema` is a **required** key. Removing the
  section means changing the schema, which every methodology yaml must then satisfy.
- `methodology/report.yaml:159` — the `appendix` section block.
- `lib/report/view.ts:80,459` — the `appendix` slice of the view model.
- `lib/report/fallback-sections.ts:347,399` — `appendixBullets` and its dispatch case.
- `lib/report/pdf/document.tsx:307,390` — its own page group, plus the `stale` caveat that renders
  **only** in the appendix. Decide where the stale caveat goes instead, or it is silently lost.
- `app/.../report/sections.tsx:277,293,382` — `BelowId`/`BELOW_IDS` and the confidence-meter case.
- Section count drops 13 → 12. The `13 / 13` counter and several tests assert on 13.

**Two consequences to confirm with Natalie before implementing**, because neither is obviously
intended by "remove the caveats section":

1. **The confidence meter and data-quality panel live inside it** — `CONFIDENCE 85%`, `RESPONDENTS`,
   `AREAS ASSESSED`, `THINNEST COVERAGE` all disappear with the section. If she wants those kept,
   they need a new home before the section is cut.
2. **`benchmark_note` and `dependency_note` are required fields** in `ReportBlocks` and are pinned by
   `passesFactCheck` in `lib/ai/prose.ts`. The appendix is their only render site. Removing it
   orphans two fields the AI still generates and the fact-check still requires — either drop them
   from the contract too, or accept generating text nothing displays.

## Standing guardrails

Never run `npm run test:db` or `supabase db push|reset`. Never merge or force-push. Never push to
`master`. Stage explicit paths only, never `.claude/`. No new dependencies. The three untracked
`docs/superpowers/` files predate this work and are deliberately unstaged.

---

## Resume prompt

```
Continue the XPG report voice rewrite in ~/Desktop/XPG-Church-Assess.

STATE: PR #67 is open and pushed on branch feat/report-xpg-voice-rewrite (based on master at
d6df45b), two commits: 49a9a9c (copy layer: copy.yaml, report.yaml, SYSTEM_PROMPT, the OVERALL
hero label) and 725060d (reader-facing vocabulary in TypeScript: BAND_NAME, rules.yaml tier
names, dashboard stat labels, offers.yaml hooks, lib/report/cta.ts). Verified green at 725060d:
1458 tests pass, npx tsc --noEmit clean, npm run lint clean. Nothing merged; master untouched.

START BY READING docs/brand/HANDOFF-voice-rewrite.md — it has the full state, the decisions and
their reasons, and the traps. Then docs/brand/xpg-voice.md if you need the voice itself. Do NOT
read the source PDF (~/Desktop/XPG Church Health Assessment Guide (1).pdf); it is 38 pages of
images and will eat your whole context window.

⚠️ PR #67 IS ALREADY MERGED (merge commit 5bd33d6) and it merged ONLY 49a9a9c. The band/tier
work and this handoff were pushed to that branch AFTER the merge and are orphaned. They have been
cherry-picked onto a fresh branch feat/report-band-tier-vocabulary off origin/master, verified
green (1458 tests, tsc, lint), but NOT pushed and NO PR opened yet — Natalie's call.

TASKS, in order:
0. Implement the four changes in "Requested next" in the handoff doc (s9 duplicate dependency
   reads, s10 redundant DAYS caption, s11 tripled offer, removing the appendix). Ask Natalie the
   two confirmation questions flagged under item 4 BEFORE cutting the appendix — the confidence
   meter lives inside it, and benchmark_note/dependency_note lose their only render site.
   Then push feat/report-band-tier-vocabulary and open the PR.
1. Check Greptile on the CURRENT head (725060d, not 49a9a9c):
   gh api repos/MylesM18/XPG-Church-Assess/commits/725060d/check-runs
   gh api repos/MylesM18/XPG-Church-Assess/pulls/67/comments
   A clean Greptile pass creates no review object, so confirm from the check-run conclusion, not
   the PR page. Vercel "UNSTABLE" on this repo is a known permissions artifact, not a failure.
2. If Greptile raised anything, triage it: fix what is real, and say plainly what you are
   declining and why. Do not accept a suggestion just because a bot made it.
3. Re-run the full gate after any change: npx vitest run AND npx tsc --noEmit AND npm run lint.
   Vitest does not typecheck — a green suite proved nothing about tsc in this exact PR.

DO NOT:
- merge, push to master, or force-push (Natalie merges)
- run npm run test:db or supabase db push|reset
- stage .claude/ or the three untracked docs/superpowers/ files
- add dependencies
- rename band or tier IDS (only display strings moved; ids are load-bearing)

STILL OPEN, needs Natalie not you: both methodology version fields went 0.1.0 -> 0.2.0 and feed
the report cache key, so every report regenerates on merge, and no real church report has been
rendered through the new copy yet. The report page is behind auth and agents do not run auth
round-trips on this repo — flag it, do not attempt it.
```
