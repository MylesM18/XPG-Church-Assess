# M5c — PDF Export — Design

- **Milestone:** M5c (fourth and last of four M5 sub-projects; build order M5a ✅ → M5d ✅ → M5b ✅ → **M5c (this)**)
- **Date:** 2026-07-18
- **Branch:** `feat/m5c-pdf-export` off `master` (`e1ca4b8`)
- **Closes:** the final M5 acceptance criterion — *"PDF downloads"* (Eng-Spec §504)

## 1. Goal

Give the XP a branded, board-forwardable PDF of the diagnosis report, generated on demand, readable by any church member (admin or viewer), and safe to send outside the app.

Non-goal: public share links. `report_shares` exists as a table but has no RLS policy and is explicitly M6-owned (`20260715000400_rls_policies.sql:67`). M5c does not touch it.

## 2. Prime directives as they apply here

1. **The document never depends on AI.** The PDF must generate correctly with `PROSE_MODE=fallback` **and** with `prose = null`, using the same deterministic `fallbackProse` draft the page uses. Non-negotiable.
2. **The permission wall stays in Postgres.** The route reads through the existing cookie-bound **anon-key** client, so `diagnoses_select` RLS gates it. No new RPC, no new policy, **no `lib/supabase/service.ts`**.
3. **Methodology stays in versioned YAML**, loaded in TS. The PDF adds no methodology semantics.

## 3. Scope decisions (locked in brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Milestone scope | PDF export only | Smallest coherent milestone; mirrors M5a/M5b/M5d scoping. The deferred M5b cache-check fix is **not** in M5c. |
| Fidelity | Print-designed, branded | A board handout, not a screenshot. Enables a serverless-safe generator. |
| Generator | `@react-pdf/renderer` **4.5.1** | Peers `react ^19.0.0`; installed React is **19.2.7** — verified compatible, no ERESOLVE. Pure JS, no Chromium. |
| Fonts | Commit TTFs, register them | Offline and deterministic; no render-time network fetch. |
| Dispersion in PDF | **Aggregate only — no respondent names** | See §4. |

**Rejected:** headless Chrome / `@sparticuz/chromium` (≈50MB in the lambda, slow cold starts, auth-cookie forwarding); a hosted HTML→PDF service (ships church data to a third party, conflicts with §4); `pdf-lib` imperative drawing (manual pagination for nine variable-length sections is fragile and hard to review).

## 4. Confidentiality rule (load-bearing)

The on-screen report's "Where your leaders disagree" section lists **named individuals with their individual mean scores** (`app/app/[churchId]/diagnosis/report.tsx:193` — `{r.label}: {r.mean.toFixed(1)}`). `respondent_label` defaults to a person's real full name.

On screen that sits behind a membership wall. **A PDF has no wall — the file is the boundary**, and this file exists to be forwarded to a board. Attributing a specific rating to a named leader in a detached document is a materially different exposure, and it invites a performance-review conversation instead of the structural one the methodology is for.

**Rule: the PDF includes the disagreement narrative and the spread, and omits the name→score list.** The full per-person view remains available in-app to members.

This is enforced by one flag on a pure function (`audience: 'pdf' | 'screen'`), not by convention — see §5.

## 5. Architecture

### 5.1 The shared seam

`@react-pdf/renderer` uses its own layout primitives (`Page`/`View`/`Text`), so the PDF layout is necessarily a **parallel tree** to the page's JSX. Left alone those drift: someone adds a report section and the PDF silently omits it.

Fix structurally with a pure view-model both surfaces consume:

```ts
// lib/report/view.ts — pure, no React
export type ReportAudience = 'screen' | 'pdf'

export function buildReportView(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
  opts: { audience: ReportAudience },
): ReportView
```

`ReportView` carries the resolved data both surfaces need, replacing what `page.tsx` currently computes inline:

```ts
export interface ReportView {
  verdict: string
  overallScore: number
  confidence: number
  stages: StageView[]                                    // chainWalk(d, methodology)
  evidence?: { text: string; refs: EvidenceRef[] }       // refs from the primary-constraint receipt
  blindSpot?: string
  cost?: { cost: string; doNotWorkOn?: string }
  gating?: string
  generosityMode: 'breadth' | 'depth' | 'both' | null
  dispersion?: {
    text: string
    respondents: Array<{ label: string; mean: number }>  // ALWAYS [] when audience === 'pdf'
  }
  nextStep: { callType: string; hook: string; text: string }
  appendix: { categories: Diagnosis['categories']; benchmarkNote: string }
}
```

Every optional field is present-or-absent by the same rule the page uses today, so section inclusion is decided once. The audience rule is the single line that empties `dispersion.respondents` for `'pdf'` — it returns an empty array rather than omitting the field, so the narrative and spread still render while the names cannot.

Content, ordering, and inclusion logic then live in **one tested pure function**; only layout primitives differ between surfaces. This matches the seams the codebase already favours (`chainWalk`, `fallbackProse`, `passesFactCheck`).

### 5.2 Route

`GET /api/report/[runId]/pdf` (Eng-Spec §38). Keyed on `runId`, not `churchId`, so a specific run's document is stable and re-fetchable once multi-run lands.

```
runId → diagnoses row (RLS-gated, latest by generated_at)
      → payload → Diagnosis
      → PROSE_MODE gate: prose ?? fallbackProse(d, methodology)   [identical to page.tsx:64-68]
      → buildReportView(d, blocks, methodology, { audience: 'pdf' })
      → <ReportDocument view brand/> → renderToStream → Response
```

Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="xpg-diagnosis-<slug>-<YYYY-MM-DD>.pdf"`, where `<slug>` is derived from `churches.name` (lowercased, non-alphanumerics collapsed to `-`) — there is no `slug` column. Non-ASCII church names must degrade to a safe ASCII filename rather than emitting raw bytes in the header.

**M5c ships zero migrations.** pgTAP stays at Files 16 / Tests 154.

### 5.3 Files

**New**

| File | Purpose |
|---|---|
| `lib/report/view.ts` | Pure `buildReportView()` → `ReportView`. No React. |
| `lib/report/pdf/document.tsx` | `<ReportDocument>` — react-pdf primitives over the view |
| `lib/report/pdf/fonts.ts` | `Font.register()` for Fraunces + Hanken Grotesk |
| `assets/fonts/*.ttf` | Committed font files (~200KB) |
| `app/api/report/[runId]/pdf/route.ts` | GET handler |
| `tests/report/view.test.ts` | `buildReportView` unit tests |
| `tests/report/pdf-document.test.ts` | Rendered-artifact tests incl. the confidentiality sentinel |

**Modified — deliberately minimal**

- `app/app/[churchId]/diagnosis/page.tsx` — replaces inline computation (`chainWalk`, the `receipt` lookup, `dispersion_flags[0]`) with `buildReportView(..., { audience: 'screen' })`; adds the download link.
- `next.config.*` — `outputFileTracingIncludes` for the PDF route (see §7).

**`app/app/[churchId]/diagnosis/report.tsx` is NOT modified.** M5a's presentational components keep their current props, fed from the view. Their existing tests stay valid as a regression net rather than being rewritten alongside the code they guard.

### 5.4 Document structure

Same order as the screen report, so the two read as one artifact.

- *Repeating header*: monogram in `church.brand_color`, church name, "Church Health Diagnosis", generated date
- *Verdict* — headline, overall score, confidence band
- *Chain walk* — five stages; constraint marked, downstream de-emphasised
- *Evidence receipt* · *Blind spots* · *Cost + do-not-work-on* · *Gating flags* · *Generosity split*
- *Disagreement* — narrative + spread only, **no name→score list**
- *Next step* — call type + hook
- *Appendix* — all eight category scores, benchmark note, placeholder-priors caveat
- *Repeating footer*: page numbers + "Internal leadership document"

Optional sections stay conditional exactly as on screen: a diagnosis with no dispersion or no gating flags yields a shorter document, never an empty heading.

Typography: `--font-display` = Fraunces, `--font-body` = Hanken Grotesk (per `app/globals.css:13-14`). Brand color from `churches.brand_color`; monogram from `resolveBrand()`. `--berry` remains foreground error text only — never a tile or background.

## 6. Error handling

| Case | Response |
|---|---|
| No session | `401` |
| Malformed `runId` (not a UUID) | `404`, no DB round-trip |
| Run absent **or** caller not a member | `404` — deliberately identical |
| Render failure | `500`, generic body; reason logged server-side |

Row 3 is load-bearing: a non-member and a nonexistent run **must** be indistinguishable, or the route becomes an oracle for probing which run IDs exist. RLS returns zero rows in both cases, so this is free — provided no "helpful" `403` is added.

Server-side logging (per the M5b lesson): log the failure **reason only** — never the `Diagnosis`, the rendered blocks, or respondent data — and place the log where it can actually fire.

## 7. Known deployment risk

`next/font/google` leaves nothing usable at runtime, so react-pdf must read real TTFs. Files under `public/` are served statically but are **not reliably present in a Vercel lambda's filesystem** — the classic works-locally-fails-on-deploy trap.

Mitigation: keep fonts under `assets/`, add `outputFileTracingIncludes` for the PDF route in `next.config`, and **verify by generating an actual PDF from a production build**, not by assuming. Treat font loading as a first-class implementation task, not a detail.

## 8. Testing

**Unit — `buildReportView` (the valuable target; pure):**
- `audience: 'screen'` retains respondent names; `audience: 'pdf'` drops them
- optional-section inclusion (no dispersion; no gating flags)
- `NO_STRUCTURAL_CONSTRAINT` (null primary constraint) produces no phantom section
- `prose = null` falls back deterministically

**Rendered artifact — the confidentiality invariant:**
A view-model assertion alone would still pass if `<ReportDocument>` reached around the view and rendered names directly. So: build a diagnosis whose `respondent_label` is a distinctive sentinel, render the real document via `renderToBuffer`, extract text, and assert **the sentinel appears nowhere**. This test must be seen to fail if names are reintroduced — write it red first.

**Also:** a test that the document renders with `prose = null` / `PROSE_MODE=fallback` (prime directive #1).

**Not needed:** route-level membership tests. Enforcement is existing RLS already covered by pgTAP, and M5c adds no SQL.

**Verification before completion** (browser e2e, matching how M5a/M5d closed):
1. Admin downloads → **open the file**: valid PDF, correct content, no respondent names
2. Viewer downloads → succeeds
3. Non-member requests → `404`
4. `PROSE_MODE=fallback` → still generates

The AC is *"PDF downloads"*, so it is verified by generating and inspecting a real file — never by a `200`.

## 9. Gate floors (do not regress)

`tsc` **0** · `eslint` **0** · `vitest` **147+** · pgTAP **Files 16 / Tests 154** (unchanged — no SQL) · `next build` ok.

## 10. Out of scope

Public share links (`report_shares`, M6) · the deferred M5b cache-check scoping · multi-run / "start a new assessment" · emailing the PDF · classify signals (Eng-Spec §8.1, still deferred).
