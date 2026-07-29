# Diagnosis report — presentation & copy refresh

**Date:** 2026-07-29
**Branch:** `feat/report-presentation-refresh` off `origin/master` (`19d97dc`)
**Type:** Presentation + copy only. **No DB migration, no engine change** — so no owner `db push`/`test:db` gate.

## Goal

Five owner-requested changes to the diagnosis report, applied consistently across all
three render surfaces (authenticated screen, forwarded share link, PDF):

1. Remove the respondent **"N"** column and **"N=1"** header language from what is shown.
2. Rename the healthy state from **"Holding" → "Strong"** everywhere it is named.
3. Redesign **"How your areas depend on each other"** for legibility.
4. Redesign the **Appendix** for legibility.
5. Add a **booking call-to-action** with a clickable link on all surfaces.

The report has one view model (`lib/report/view.ts`) consumed by every surface, so
content/ordering cannot drift; only layout primitives differ per surface. Keep that
discipline — new shared copy lives in one place, rendered identically everywhere.

## Surfaces (the three that must stay in parity)

- **Screen** (authed): `app/app/[churchId]/diagnosis/report/*` components.
- **Shared** (forwarded link): `app/r/[shareToken]/page.tsx` + `report/shared.tsx`
  (`ReportBody`, `Appendix`, `NextStep`). Reuses `cover.tsx`'s `CoverCard`/`VerdictHeader`/`AreaTable`.
- **PDF**: `lib/report/pdf/document.tsx` (react-pdf) — its own layout, same content.

---

## 1. Remove respondent "N" from render surfaces

Keep `AreaDossierView.n` in the view model — `insideItFor`/`agreementFor` gate on it
(`n < 2`). Only strip it from what is **displayed**:

- `report/cover.tsx` `AreaTable`: drop the `N` `<th>` (line ~73) and the `{area.n}` `<td>`
  (line ~82). Table becomes **Area · Score · Band**. Fixes the shared surface too (same component).
- `report/dossier.tsx:41`: `` `${area.score}  ·  N=${area.n}` `` → `` `${area.score}` ``.
- `pdf/document.tsx:153`: dossier meta, same edit.
- `pdf/document.tsx` `AreaTable` (~lines 210–230): drop the `N` header + `{area.n}` cell.

**Out of scope:** the `r=… (n=…)` correlation stat (statistical sample size, different
meaning, only renders when correlations exist). Leave as-is.

## 2. "Holding" → "Strong" (healthy state)

Change only the **displayed English**; keep internal identifiers (`ReadingBand` value
`'holding'`, `StageBucket` `'holding'`, copy.yaml keys `holding:` / `both_strong:`).

| Where | File | Change |
| --- | --- | --- |
| Band-column label | `lib/report/view.ts` `READING_BAND_LABEL.holding` | `'Holding'` → `'Strong'` |
| Chain-walk tile label | `report/chain.tsx:8`, `pdf/document.tsx:238` | `'Holding'` → `'Strong'` |
| Dependency group label | `report/system.tsx:16`, `pdf/document.tsx:117` | `both_strong: 'Both holding'` → `'Both strong'` |
| Dossier reading prose | `methodology/copy.yaml:21,26` | "This is holding…" → "This is strong…" |
| Dependency read sentences | `methodology/copy.yaml:42,43,44` | "…is holding…" / "Both are holding — nothing to flag here." → "…is strong…" / "Both are strong — nothing to flag here." |
| No-constraint verdict | `methodology/copy.yaml:4` | "Every stage is holding." → "Every stage is strong." |
| Cover / PDF constraint-none line | `report/cover.tsx:32`, `pdf/document.tsx:198` | "…every stage holding" → "…every stage strong" |

## 3. "How your areas depend on each other" — legibility

`report/system.tsx` `DependencyMap` + `pdf/document.tsx` mirror. Today: gray-statement /
black-sentence `<li>` stack grouped by read; when everything is healthy it is 8
near-identical lines.

New per-edge **row**:
- A colored **status pill** for the group: Load-bearing (berry/amber), At risk (amber),
  Clear (neutral), **Both strong** (sage/green).
- **From (74) → To (70)** with the arrow and gates/feeds verb as the primary line.
- The plain-English read as a muted subline; the "why" statement as a smaller caption.
- **Refinement (approved):** when a whole group is `both_strong`, show "nothing to flag
  here" **once at the group level**, not repeated on all rows.

Groups keep their fixed `READ_ORDER` (load_bearing → at_risk → clear → both_strong).

## 4. Appendix — legibility

`report/shared.tsx` `Appendix` (screen + shared) + `pdf/document.tsx` appendix block.
Today: flat inline list "Guest Experience (stage 1): 74 · 78th pct".

New: aligned **table — Area · Role · Score · Percentile** (Role = "Stage 1–5" or
"Enabler", derived from the same stage/enabler + index already available), so scores and
percentiles line up and compare at a glance. The two caveat notes (benchmark, dependency)
stay beneath. Same table shape in the PDF.

## 5. Booking call-to-action (new)

One shared source of truth (a constant, e.g. `lib/report/cta.ts` exporting
`{ url, heading, body, buttonLabel }`) rendered identically on all three surfaces:

- URL: `https://api.leadconnectorhq.com/widget/bookings/xpgatheringdiscovery`
- Web (screen + shared): `<a href target="_blank" rel="noopener noreferrer">` styled as a button.
- PDF: react-pdf `<Link src=…>` styled button-ish.
- Placement: **after** the existing dynamic `NextStep` prose (Layer 4). On the shared
  surface `NextStep` is absent, so the booking CTA stands alone there.
- Shown on **all three** surfaces including the forwarded share link (booking a free call
  is not an admin-only action; a forwarded reader is a prime lead).

Approved copy:

> **Take the next step**
> You've seen where your church is strong and where the real constraint is. The fastest
> way to turn this into a plan is a conversation. Book a free call with the XP Gathering
> team — we'll walk through your results together and map the next few moves for your
> church. No cost, no pressure.
> **[ Book your free call → ]**

## Test guards (TDD, guard-first per change)

Update/add in `tests/report/` and `tests/methodology/`:
- `components.test.ts` — AreaTable no longer has an `N` header/column; dossier header has
  no `N=`; "Both strong" label; new booking CTA link present.
- `pdf-document.test.ts` — mirror guards; readingLabel "Strong" (existing Watch-state guard
  unaffected); PDF booking `<Link>` URL present.
- `view.test.ts` — `READING_BAND_LABEL`/readingLabel now yields "Strong" for healthy.
- `copy.test.ts` / `dossier-reading-bands.test.ts` — any assertion pinning "holding" text
  → "strong"; the `toHaveLength(15)` count is unchanged (values only).
- `audience.test.ts` / `audience-parity.test.ts` — parity holds; no respondent names.
- New: a test asserting the booking URL renders on **each** of the three surfaces.

## Gates & guardrails

- Gates: `typecheck` 0, `lint` 0, `vitest` all green (floor currently **469**; this change
  only edits/adds tests, does not drop any).
- ⛔ Agent never runs `test:db`, `supabase db push|reset`; never merges/pushes/force-pushes
  `master`. Stage by **explicit path** only; never stage `.claude/` or
  `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md` (the two permanent
  untracked strays). `GIT_LITERAL_PATHSPECS=1` for any `[churchId]`/`[categoryId]` path.
- No new dependencies. react-pdf `<Link>` already available via `@react-pdf/renderer`.
- Owner-gated tail (Natalie only): browser-glance the three surfaces, then open/merge the PR.

## Out of scope

- Correlation `(n=…)` statistical notation.
- Any engine/methodology-rules change; any migration.
- The dashboard/answer/invite privacy notes (already shipped in PR #35/#36).
