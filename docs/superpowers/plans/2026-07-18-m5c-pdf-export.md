# M5c — PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a branded, board-forwardable PDF of the diagnosis report at `GET /api/report/[runId]/pdf`, readable by any church member, omitting per-respondent names.

**Architecture:** A pure `buildReportView()` resolves the report's ordered section data once; the existing page and a new `@react-pdf/renderer` document both consume it, so the two layouts cannot drift. The route reads the diagnosis through the existing anon-key client, so Postgres RLS is the permission wall. No migrations.

**Tech Stack:** TypeScript, Next.js 16 (App Router, Node runtime), React 19.2.7, `@react-pdf/renderer` 4.5.1, Vitest (node env), Supabase (RLS).

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec.

- **Prime directive 1 — the document never depends on AI.** The PDF must generate correctly with `PROSE_MODE=fallback` **and** with `prose = null`, using the same deterministic `fallbackProse` draft the page uses. Non-negotiable.
- **Prime directive 2 — the permission wall stays in Postgres.** The route reads via the existing cookie-bound **anon-key** client (`lib/supabase/server.ts`). No new RPC, no new RLS policy, **no `lib/supabase/service.ts`**. **M5c ships ZERO migrations** — pgTAP stays at Files 16 / Tests 154.
- **Confidentiality rule:** the PDF includes the disagreement narrative and spread, and **omits the name→score list**. Enforced by `audience: 'pdf'` emptying `dispersion.respondents` to `[]` — an empty array, never an omitted field, so the section still renders without names.
- **Dependency pin:** `@react-pdf/renderer` at **`4.5.1`** (exact, no `^`). Peers `react ^19.0.0`; installed React is 19.2.7 — verified compatible.
- **404 indistinguishability:** a non-member and a nonexistent run MUST both return `404`. Never add a `403` — it would turn the route into an oracle for probing which run IDs exist.
- **Logging:** log the failure **reason only** — never the `Diagnosis`, rendered blocks, or respondent data.
- **`report.tsx` is NOT modified.** M5a's presentational components keep their current props, fed from the view, so their tests stay valid as a regression net.
- **Brand:** `--font-display` = Fraunces, `--font-body` = Hanken Grotesk (`app/globals.css:13-14`). `--berry` (`#8E2B3E`) is foreground error text ONLY — never a tile or background.
- **Gate floors (do not regress):** `tsc` **0** · `eslint` **0** · `vitest` **147+** · pgTAP **Files 16 / Tests 154** · `next build` ok. Scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:db`, `npm run build`.
- **Repo:** branch `feat/m5c-pdf-export` off `master` (`e1ca4b8`). `.superpowers/` stays untracked. Push as **MylesM18** only on explicit go-ahead — not part of any task here.

## Pinned research facts (verified this session — do NOT re-look-up)

- `renderToBuffer(element)` → `Promise<Buffer>`; **Node-only** (triggers Yoga WASM compilation). The route MUST declare `export const runtime = 'nodejs'`. Edge will fail.
- `renderToStream(element)` → `Promise<NodeJS.ReadableStream>`. Prefer `renderToBuffer` here: a Node stream needs conversion to a Web stream in App Router, and a Buffer is already a `Uint8Array`, so `new Response(buffer)` works directly.
- Font registration, bulk form:
  ```ts
  Font.register({ family: 'Fraunces', fonts: [{ src: '/abs/path/Fraunces-Regular.ttf', fontWeight: 400 }] })
  ```
  `src` accepts an absolute filesystem path in Node.
- **Vitest only collects `tests/**/*.test.ts` — NOT `.tsx`** (`vitest.config.ts`). Test files must be `.ts` and build elements with `React.createElement(...)` rather than JSX. Do not change the config.
- **Use STATIC font instances, not variable TTFs.** Fraunces on Google Fonts is variable-only by default; fontkit (react-pdf's shaper) handles static instances reliably and variable fonts poorly. Download static weights.
- **react-pdf compresses content streams by default** (PDFKit `compress: true`). A raw `buffer.includes('sentinel')` search will therefore likely pass even when the text IS present — a vacuous test. Task 4 mandates a red-first check precisely to catch this, and pins `pdf-parse` for real text extraction.

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `lib/report/view.ts` | 1 | Pure `buildReportView()` → `ReportView`. No React. Owns section inclusion + the audience rule. |
| `tests/report/view.test.ts` | 1 | Unit tests for the above |
| `app/app/[churchId]/diagnosis/page.tsx` | 2, 5 | Consumes the view (`audience: 'screen'`); gains the download link |
| `assets/fonts/*.ttf` | 3 | Committed static brand fonts |
| `lib/report/pdf/fonts.ts` | 3 | `registerReportFonts()` — idempotent `Font.register` |
| `next.config.ts` | 3 | `outputFileTracingIncludes` so fonts reach the lambda |
| `lib/report/pdf/document.tsx` | 4 | `<ReportDocument>` — react-pdf primitives over the view |
| `tests/report/pdf-document.test.ts` | 4 | Rendered-artifact tests incl. the confidentiality sentinel |
| `app/api/report/[runId]/pdf/route.ts` | 5 | GET handler: RLS read → view → render → Response |

---

## Task 1: `buildReportView` — the shared view-model

**Files:**
- Create: `lib/report/view.ts`
- Test: `tests/report/view.test.ts`

**Interfaces:**
- Consumes: `Diagnosis`, `DiagnosisCategory`, `EvidenceRef` (`lib/engine/types.ts`); `ReportBlocks` (`lib/ai/fallback.ts`); `Methodology` (`lib/methodology/schema.ts`); `chainWalk`, `StageView` (`lib/report/chain-walk.ts`).
- Produces: `buildReportView(d, blocks, methodology, opts)`, `ReportView`, `ReportAudience` — consumed by Tasks 2, 4, 5.

- [ ] **Step 1: Write the failing tests**

Create `tests/report/view.test.ts`. Build fixtures with a helper so each test states only what it varies.

```ts
import { describe, it, expect } from 'vitest';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis } from '@/lib/engine/types';
import type { ReportBlocks } from '@/lib/ai/fallback';

const methodology = loadMethodology();

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: methodology.version,
    overall_score: 55,
    categories: [
      { category_id: 'guest_experience', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2 },
      { category_id: 'connections', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2 },
    ],
    primary_constraint: { category_id: 'guest_experience' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    dispersion_flags: [],
    offer: { call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience',
        refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
    ...over,
  } as Diagnosis;
}

function blocks(over: Partial<ReportBlocks> = {}): ReportBlocks {
  return {
    verdict: 'Guest Experience is the constraint. It scored 30 out of 100.',
    next_step: 'Start with the first weekend touchpoint.',
    benchmark_note: 'Benchmarks are provisional priors.',
    ...over,
  };
}

const WITH_DISPERSION = {
  dispersion_flags: [{
    category_id: 'guest_experience',
    respondents: [{ label: 'Dana Okafor', mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
    spread: 2.2,
  }],
};

describe('buildReportView', () => {
  it('resolves the verdict, score, confidence and chain stages', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.verdict).toContain('Guest Experience');
    expect(v.overallScore).toBe(55);
    expect(v.confidence).toBe(0.8);
    expect(v.stages.length).toBeGreaterThan(0);
  });

  it('attaches evidence refs from the primary-constraint receipt', () => {
    const v = buildReportView(diagnosis(), blocks({ evidence: 'Two of three guest items are low.' }),
      methodology, { audience: 'screen' });
    expect(v.evidence?.refs).toEqual([{ kind: 'item', ref: 'G1', value: 3 }]);
  });

  it('omits optional sections whose blocks are absent', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.evidence).toBeUndefined();
    expect(v.blindSpot).toBeUndefined();
    expect(v.cost).toBeUndefined();
    expect(v.gating).toBeUndefined();
    expect(v.dispersion).toBeUndefined();
  });

  it('keeps respondent names for the screen audience', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'screen' });
    expect(v.dispersion?.respondents.map((r) => r.label)).toEqual(['Dana Okafor', 'Sam Reyes']);
  });

  it('drops respondent names for the pdf audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'pdf' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  it('produces no phantom sections when there is no structural constraint', () => {
    const v = buildReportView(
      diagnosis({ primary_constraint: null, evidence_trail: [] }), blocks(), methodology,
      { audience: 'pdf' },
    );
    expect(v.evidence).toBeUndefined();
    expect(v.verdict).toBeTruthy();
    expect(v.appendix.categories.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- tests/report/view.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/report/view"`.

- [ ] **Step 3: Implement `buildReportView`**

Create `lib/report/view.ts`:

```ts
import type { Diagnosis, DiagnosisCategory, EvidenceRef, GenerosityMode } from '../engine/types';
import type { ReportBlocks } from '../ai/fallback';
import type { Methodology } from '../methodology/schema';
import { chainWalk, type StageView } from './chain-walk';

export type ReportAudience = 'screen' | 'pdf';

export interface ReportView {
  verdict: string;
  overallScore: number;
  confidence: number;
  stages: StageView[];
  evidence?: { text: string; refs: EvidenceRef[] };
  blindSpot?: string;
  cost?: { cost: string; doNotWorkOn?: string };
  gating?: string;
  generosityMode: GenerosityMode;
  dispersion?: { text: string; respondents: Array<{ label: string; mean: number }> };
  nextStep: { callType: string; hook: string; text: string };
  appendix: { categories: DiagnosisCategory[]; benchmarkNote: string };
}

/**
 * Resolves everything both report surfaces need, once. The page and the PDF
 * document consume this so section content and ordering cannot drift apart;
 * only layout primitives differ between them.
 *
 * audience === 'pdf' empties dispersion.respondents. A PDF leaves the
 * permission wall, so the per-person name-to-score list must not travel with
 * it. The field stays present-but-empty so the narrative still renders.
 */
export function buildReportView(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
  opts: { audience: ReportAudience },
): ReportView {
  const primaryId = d.primary_constraint?.category_id ?? null;

  const receipt = primaryId
    ? d.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined;

  const flag = d.dispersion_flags[0];

  return {
    verdict: blocks.verdict,
    overallScore: d.overall_score,
    confidence: d.confidence,
    stages: chainWalk(d, methodology),

    evidence: blocks.evidence
      ? { text: blocks.evidence, refs: receipt?.refs ?? [] }
      : undefined,

    blindSpot: blocks.blind_spot,

    cost: blocks.cost
      ? { cost: blocks.cost, doNotWorkOn: blocks.do_not_work_on }
      : undefined,

    gating: blocks.gating,
    generosityMode: d.generosity_mode,

    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents: opts.audience === 'pdf' ? [] : (flag?.respondents ?? []),
        }
      : undefined,

    nextStep: { callType: d.offer.call_type, hook: d.offer.hook, text: blocks.next_step },
    appendix: { categories: d.categories, benchmarkNote: blocks.benchmark_note },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- tests/report/view.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the audience rule actually bites (red-first proof)**

Temporarily change the `dispersion.respondents` line to `respondents: flag?.respondents ?? []` (dropping the audience check). Re-run.
Expected: the `drops respondent names for the pdf audience` test FAILS. **Revert the probe** and confirm the suite is green again.

This proves the confidentiality test is not vacuous. Record both outcomes in your report.

- [ ] **Step 6: Run the full gate and commit**

```bash
npm run typecheck && npm run test
git add lib/report/view.ts tests/report/view.test.ts
git commit -m "feat(m5c): add pure buildReportView shared by report surfaces"
```

---

## Task 2: Refactor the report page onto the view

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx:70-107`

**Interfaces:**
- Consumes: `buildReportView`, `ReportView` (Task 1).
- Produces: nothing new. This is a behaviour-preserving refactor.

**Context:** `page.tsx` currently computes `stages`, `receipt`, `dispersion` inline (lines 70-76) and passes them to `report.tsx` components (lines 78-107). Those components are **not** changed — they keep their current props, now sourced from the view. The existing `tests/report/render.test.ts` is the regression net: it must stay green untouched.

- [ ] **Step 1: Replace the inline computation**

In `app/app/[churchId]/diagnosis/page.tsx`, delete lines 70-76:

```ts
  const stages = chainWalk(diagnosis, methodology)

  const primaryId = diagnosis.primary_constraint?.category_id ?? null
  const receipt = primaryId
    ? diagnosis.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined
  const dispersion = diagnosis.dispersion_flags[0]
```

and replace with:

```ts
  const view = buildReportView(diagnosis, blocks, methodology, { audience: 'screen' })
```

- [ ] **Step 2: Update the imports**

Remove the now-unused `chainWalk` import and add the view import:

```ts
import { buildReportView } from '@/lib/report/view'
```

- [ ] **Step 3: Feed the components from the view**

Replace the JSX body (lines 78-107) with:

```tsx
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={church.name}
        brandColor={church.brand_color}
        monogram={brand.monogram}
        verdict={view.verdict}
        overallScore={view.overallScore}
        confidence={view.confidence}
      />

      <ChainWalk stages={view.stages} />

      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.blindSpot && <BlindSpots text={view.blindSpot} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      {view.gating && <GatingFlags text={view.gating} />}
      {view.generosityMode !== null && <GenerositySplit mode={view.generosityMode} />}
      {view.dispersion && (
        <Disagreement text={view.dispersion.text} respondents={view.dispersion.respondents} />
      )}

      <NextStep
        callType={view.nextStep.callType}
        hook={view.nextStep.hook}
        nextStep={view.nextStep.text}
      />

      <Appendix diagnosis={diagnosis} methodology={methodology} benchmarkNote={view.appendix.benchmarkNote} />
    </main>
  )
```

- [ ] **Step 4: Verify nothing regressed**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: tsc 0, eslint 0, all tests pass (count unchanged from Task 1's total), build ok. `tests/report/render.test.ts` must pass **without modification** — if it fails, the refactor changed behaviour and must be corrected rather than the test updated.

- [ ] **Step 5: Commit**

```bash
git add "app/app/[churchId]/diagnosis/page.tsx"
git commit -m "refactor(m5c): drive the report page from buildReportView"
```

---

## Task 3: Brand fonts — acquire, register, and prove they reach the lambda

**Files:**
- Create: `assets/fonts/Fraunces-Regular.ttf`, `assets/fonts/Fraunces-SemiBold.ttf`, `assets/fonts/HankenGrotesk-Regular.ttf`, `assets/fonts/HankenGrotesk-Bold.ttf`
- Create: `lib/report/pdf/fonts.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `registerReportFonts()` and the exported family constants `FONT_DISPLAY` / `FONT_BODY` — consumed by Task 4.

**Context:** `next/font/google` leaves nothing usable at runtime, so react-pdf must read real TTFs. This task exists separately because font loading is the milestone's known deployment risk (spec §7): files under `public/` are served statically but are **not** reliably present in a Vercel lambda's filesystem.

- [ ] **Step 1: Download STATIC font instances**

Fraunces is variable-only on Google Fonts by default; fontkit handles static instances reliably and variable fonts poorly. Fetch static weights from the `google/fonts` repo:

```bash
mkdir -p assets/fonts
curl -fsSL -o assets/fonts/Fraunces-Regular.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/static/Fraunces_9pt-Regular.ttf"
curl -fsSL -o assets/fonts/Fraunces-SemiBold.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/static/Fraunces_9pt-SemiBold.ttf"
curl -fsSL -o assets/fonts/HankenGrotesk-Regular.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/hankengrotesk/static/HankenGrotesk-Regular.ttf"
curl -fsSL -o assets/fonts/HankenGrotesk-Bold.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/hankengrotesk/static/HankenGrotesk-Bold.ttf"
```

Verify each is a real TrueType file, not a 404 HTML page:

```bash
file assets/fonts/*.ttf
```
Expected: each line reports `TrueType Font data`. If any says `HTML document`, the upstream path moved — find the correct `static/` path in the `google/fonts` repo before continuing. Do not proceed with a broken file.

Both families are SIL Open Font License; committing them is permitted. Keep the OFL notice:

```bash
curl -fsSL -o assets/fonts/OFL.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt"
```

- [ ] **Step 2: Write the font registration module**

Create `lib/report/pdf/fonts.ts`:

```ts
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

export const FONT_DISPLAY = 'Fraunces';
export const FONT_BODY = 'HankenGrotesk';

const dir = path.join(process.cwd(), 'assets', 'fonts');

let registered = false;

/**
 * Idempotent. react-pdf's font store is module-global and a warm lambda reuses
 * it across requests, so registering twice is wasted work.
 */
export function registerReportFonts(): void {
  if (registered) return;

  Font.register({
    family: FONT_DISPLAY,
    fonts: [
      { src: path.join(dir, 'Fraunces-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'Fraunces-SemiBold.ttf'), fontWeight: 600 },
    ],
  });

  Font.register({
    family: FONT_BODY,
    fonts: [
      { src: path.join(dir, 'HankenGrotesk-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'HankenGrotesk-Bold.ttf'), fontWeight: 700 },
    ],
  });

  registered = true;
}
```

- [ ] **Step 3: Install the renderer at the pinned version**

```bash
npm install @react-pdf/renderer@4.5.1 --save-exact
grep -E '"@react-pdf/renderer"' package.json
```
Expected: `"@react-pdf/renderer": "4.5.1",` — no `^`. If npm reports ERESOLVE, STOP and report; do not use `--legacy-peer-deps`.

- [ ] **Step 4: Trace the fonts into the serverless bundle**

In `next.config.ts`, add `outputFileTracingIncludes` so the TTFs ship with the route (a runtime `path.join` is not statically analyzable, so Next cannot infer this):

```ts
const nextConfig: NextConfig = {
  // ...existing config...
  outputFileTracingIncludes: {
    '/api/report/[runId]/pdf': ['./assets/fonts/**'],
  },
};
```

- [ ] **Step 5: Prove the fonts actually load**

A registration that silently fails would fall back to Helvetica and nobody would notice until a board saw it. Write a throwaway check:

```bash
cat > /tmp/font-check.mjs <<'EOF'
import { renderToBuffer, Document, Page, Text, StyleSheet } from '@react-pdf/renderer';
import { createElement as h } from 'react';
import { registerReportFonts, FONT_DISPLAY } from './lib/report/pdf/fonts.ts';

registerReportFonts();
const s = StyleSheet.create({ t: { fontFamily: FONT_DISPLAY, fontSize: 24 } });
const doc = h(Document, null, h(Page, null, h(Text, { style: s.t }, 'Fraunces smoke test')));
const buf = await renderToBuffer(doc);
const hit = buf.toString('latin1').includes('Fraunces');
console.log('bytes:', buf.length, '| Fraunces embedded:', hit);
process.exit(hit ? 0 : 1);
EOF
npx tsx /tmp/font-check.mjs
```
Expected: a non-trivial byte count and `Fraunces embedded: true`, exit 0. Font names appear uncompressed in the PDF's font descriptors, so this check is meaningful even though content streams are compressed. If it prints `false`, the registration is not working — fix it before Task 4. Delete `/tmp/font-check.mjs` when done.

- [ ] **Step 6: Commit**

```bash
git add assets/fonts lib/report/pdf/fonts.ts next.config.ts package.json package-lock.json
git commit -m "feat(m5c): add @react-pdf/renderer and register brand fonts for PDF output"
```

---

## Task 4: `<ReportDocument>` — the PDF component

**Files:**
- Create: `lib/report/pdf/document.tsx`
- Test: `tests/report/pdf-document.test.ts` (**`.ts`, not `.tsx`** — vitest only collects `.test.ts`)

**Interfaces:**
- Consumes: `ReportView` (Task 1); `registerReportFonts`, `FONT_DISPLAY`, `FONT_BODY` (Task 3).
- Produces: `ReportDocument` — a React component taking `{ view: ReportView; churchName: string; brandColor: string; monogram: string; generatedAt: Date }`. Consumed by Task 5.

- [ ] **Step 1: Add the text-extraction dev dependency**

The confidentiality test must read the PDF's *rendered text*. react-pdf compresses content streams, so a raw buffer search would pass even when the text is present — a vacuous test.

```bash
npm install --save-dev pdf-parse@2.4.5 --save-exact
```

- [ ] **Step 2: Write the failing tests**

Create `tests/report/pdf-document.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import pdfParse from 'pdf-parse';
import { ReportDocument } from '@/lib/report/pdf/document';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';

const methodology = loadMethodology();

const SENTINEL = 'Zzyzx Quimby';

function diagnosis(): Diagnosis {
  return {
    methodology_version: methodology.version,
    overall_score: 55,
    categories: [
      { category_id: 'guest_experience', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2 },
      { category_id: 'connections', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2 },
    ],
    primary_constraint: { category_id: 'guest_experience' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    dispersion_flags: [{
      category_id: 'guest_experience',
      respondents: [{ label: SENTINEL, mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
      spread: 2.2,
    }],
    offer: { call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience', refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
  } as Diagnosis;
}

async function renderText(audience: 'screen' | 'pdf'): Promise<string> {
  const d = diagnosis();
  const blocks = fallbackProse(d, methodology);
  const view = buildReportView(d, blocks, methodology, { audience });
  const buffer = await renderToBuffer(
    createElement(ReportDocument, {
      view,
      churchName: 'Grace Church',
      brandColor: '#3A4A6B',
      monogram: 'GC',
      generatedAt: new Date('2026-07-18T00:00:00Z'),
    }),
  );
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

describe('ReportDocument', () => {
  it('renders the church name and the verdict', async () => {
    const text = await renderText('pdf');
    expect(text).toContain('Grace Church');
    expect(text).toContain('Guest Experience');
  }, 30_000);

  it('NEVER prints a respondent name in the pdf audience', async () => {
    const text = await renderText('pdf');
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('Sam Reyes');
  }, 30_000);

  it('still renders the disagreement narrative without the names', async () => {
    const text = await renderText('pdf');
    expect(text.toLowerCase()).toContain('disagree');
  }, 30_000);

  it('renders with no AI prose (prime directive 1)', async () => {
    const text = await renderText('pdf');
    expect(text).toContain('Benchmarks');
    expect(text.length).toBeGreaterThan(200);
  }, 30_000);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- tests/report/pdf-document.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/report/pdf/document"`.

- [ ] **Step 4: Implement the document**

Create `lib/report/pdf/document.tsx`:

```tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportView } from '../view';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 48,
          fontFamily: FONT_BODY, fontSize: 11, color: INK, lineHeight: 1.5 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24,
            paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: RULE },
  monogram: { width: 28, height: 28, borderRadius: 14, color: '#FFFFFF',
              fontSize: 12, textAlign: 'center', paddingTop: 8, marginRight: 10 },
  headerText: { flexDirection: 'column' },
  churchName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 },
  headerMeta: { fontSize: 9, color: INK_SOFT },
  h2: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, marginBottom: 6 },
  section: { marginBottom: 18 },
  verdict: { fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 1.4, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', gap: 16, fontSize: 10, color: INK_SOFT },
  stage: { flexDirection: 'row', justifyContent: 'space-between',
           paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE },
  stageConstraint: { fontWeight: 700 },
  stageDownstream: { color: INK_SOFT },
  refs: { fontSize: 9, color: INK_SOFT, marginTop: 4 },
  appendixRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48,
            flexDirection: 'row', justifyContent: 'space-between',
            fontSize: 8, color: INK_SOFT },
});

export interface ReportDocumentProps {
  view: ReportView;
  churchName: string;
  brandColor: string;
  monogram: string;
  generatedAt: Date;
}

export function ReportDocument({
  view, churchName, brandColor, monogram, generatedAt,
}: ReportDocumentProps) {
  const dateLabel = generatedAt.toISOString().slice(0, 10);

  return (
    <Document title={`${churchName} — Church Health Diagnosis`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={[s.monogram, { backgroundColor: brandColor }]}>{monogram}</Text>
          <View style={s.headerText}>
            <Text style={s.churchName}>{churchName}</Text>
            <Text style={s.headerMeta}>Church Health Diagnosis · {dateLabel}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.verdict}>{view.verdict}</Text>
          <View style={s.scoreRow}>
            <Text>Overall score: {view.overallScore}</Text>
            <Text>Confidence: {view.confidence.toFixed(2)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>The chain</Text>
          {view.stages.map((st) => (
            <View key={st.category_id} style={s.stage}>
              <Text style={
                st.bucket === 'constraint' ? s.stageConstraint
                : st.bucket === 'downstream' ? s.stageDownstream
                : undefined
              }>
                {st.name}{st.bucket === 'constraint' ? '  ← your constraint' : ''}
              </Text>
              <Text>{st.score}</Text>
            </View>
          ))}
        </View>

        {view.evidence && (
          <View style={s.section}>
            <Text style={s.h2}>Why we say that</Text>
            <Text>{view.evidence.text}</Text>
            {view.evidence.refs.length > 0 && (
              <Text style={s.refs}>
                {view.evidence.refs.map((r) => `${r.ref}${r.value === null ? '' : `: ${r.value}`}`).join('  ·  ')}
              </Text>
            )}
          </View>
        )}

        {view.blindSpot && (
          <View style={s.section}>
            <Text style={s.h2}>Blind spots</Text>
            <Text>{view.blindSpot}</Text>
          </View>
        )}

        {view.cost && (
          <View style={s.section}>
            <Text style={s.h2}>What it is costing you</Text>
            <Text>{view.cost.cost}</Text>
            {view.cost.doNotWorkOn && <Text style={s.refs}>{view.cost.doNotWorkOn}</Text>}
          </View>
        )}

        {view.gating && (
          <View style={s.section}>
            <Text style={s.h2}>Conditions to clear first</Text>
            <Text>{view.gating}</Text>
          </View>
        )}

        {view.generosityMode !== null && (
          <View style={s.section}>
            <Text style={s.h2}>Generosity</Text>
            <Text>
              {view.generosityMode === 'breadth'
                ? 'Breadth is the gap: fewer people give than the size of your congregation implies.'
                : view.generosityMode === 'depth'
                  ? 'Depth is the gap: people give, but giving per household is shallow.'
                  : 'Both breadth and depth are gaps: fewer people give, and those who do give shallowly.'}
            </Text>
          </View>
        )}

        {view.dispersion && (
          <View style={s.section}>
            <Text style={s.h2}>Where your leaders disagree</Text>
            <Text>{view.dispersion.text}</Text>
            {view.dispersion.respondents.map((r) => (
              <Text key={r.label} style={s.refs}>{r.label}: {r.mean.toFixed(1)}</Text>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.h2}>Your next step</Text>
          <Text>{view.nextStep.text}</Text>
          <Text style={s.refs}>{view.nextStep.callType} — {view.nextStep.hook}</Text>
        </View>

        <View style={s.section} break>
          <Text style={s.h2}>Appendix — all category scores</Text>
          {view.appendix.categories.map((c) => (
            <View key={c.category_id} style={s.appendixRow}>
              <Text>{c.category_id}</Text>
              <Text>{c.score}</Text>
            </View>
          ))}
          <Text style={s.caveat}>{view.appendix.benchmarkNote}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Internal leadership document</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
```

Note the dispersion block still maps `respondents` — that is deliberate. The view has already emptied the array for `audience: 'pdf'`, so the rule lives in exactly one place (Task 1) rather than being duplicated here.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- tests/report/pdf-document.test.ts`
Expected: PASS, 4 tests. First run is slow (Yoga WASM compile) — hence the 30s timeouts.

- [ ] **Step 6: Prove the confidentiality test is not vacuous (mandatory red-first)**

The whole point of this test is that it fails if names come back. Verify it does:

In `lib/report/pdf/document.tsx`, temporarily add a hardcoded leak inside the dispersion section, immediately after the `{view.dispersion.text}` line:

```tsx
            <Text style={s.refs}>Zzyzx Quimby: 3.1</Text>
```

This renders the sentinel unconditionally, simulating the exact regression the test exists to catch.

Run: `npm run test -- tests/report/pdf-document.test.ts`
Expected: the `NEVER prints a respondent name` test **FAILS**.

**Revert the probe** and re-run to confirm 4/4 green. If the test did NOT fail, `pdf-parse` is not extracting text as expected — stop and fix the test before proceeding, because it is currently proving nothing. Record both outcomes in your report.

- [ ] **Step 7: Run the full gate and commit**

```bash
npm run typecheck && npm run lint && npm run test
git add lib/report/pdf/document.tsx tests/report/pdf-document.test.ts package.json package-lock.json
git commit -m "feat(m5c): render the diagnosis report as a branded PDF document"
```

---

## Task 5: The route and the download control

**Files:**
- Create: `app/api/report/[runId]/pdf/route.ts`
- Modify: `app/app/[churchId]/diagnosis/page.tsx` (add the download link)

**Interfaces:**
- Consumes: `buildReportView` (Task 1); `ReportDocument` (Task 4); `createClient` (`lib/supabase/server.ts`); `loadMethodology`, `resolveBrand`, `fallbackProse`.

**Context:** RLS does the gating — `diagnoses_select` (`20260715000400_rls_policies.sql:39-42`) joins `assessment_runs` → `church_members` → `auth.uid()`. A non-member's select returns zero rows, which becomes a 404. No new SQL.

- [ ] **Step 1: Write the route**

Create `app/api/report/[runId]/pdf/route.ts`:

```ts
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { buildReportView } from '@/lib/report/view'
import { ReportDocument } from '@/lib/report/pdf/document'
import type { Diagnosis } from '@/lib/engine/types'

// renderToBuffer is Node-only (Yoga WASM + Buffer). Edge would fail at runtime.
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Filename-safe ASCII slug. There is no slug column; derive from the name. */
function slugify(name: string): string {
  const s = name.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'church'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params

  // Malformed id: fail before touching the database.
  if (!UUID.test(runId)) return new Response('Not found', { status: 404 })

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // RLS gates this select. A non-member and a nonexistent run both yield no
  // row, and both return 404 — never a 403, which would let a caller probe
  // which run ids exist.
  const { data: diag } = await supabase
    .from('diagnoses')
    .select('payload, prose, run_id')
    .eq('run_id', runId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!diag) return new Response('Not found', { status: 404 })

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('church_id, churches(name, brand_color)')
    .eq('id', runId)
    .maybeSingle()

  const church = run?.churches as unknown as { name: string; brand_color: string } | undefined
  if (!church) return new Response('Not found', { status: 404 })

  try {
    const diagnosis = diag.payload as Diagnosis
    const methodology = loadMethodology()

    // Same gate as the report page — the document never depends on AI.
    const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
    const blocks: ReportBlocks =
      PROSE_MODE !== 'fallback' && diag.prose
        ? (diag.prose as ReportBlocks)
        : fallbackProse(diagnosis, methodology)

    const view = buildReportView(diagnosis, blocks, methodology, { audience: 'pdf' })
    const brand = resolveBrand(church.name)
    const generatedAt = new Date()

    const buffer = await renderToBuffer(
      createElement(ReportDocument, {
        view,
        churchName: church.name,
        brandColor: church.brand_color,
        monogram: brand.monogram,
        generatedAt,
      }),
    )

    const filename = `xpg-diagnosis-${slugify(church.name)}-${generatedAt.toISOString().slice(0, 10)}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    // Reason only — never the Diagnosis, the blocks, or respondent data.
    console.warn('[m5c] PDF render failed:', err instanceof Error ? err.message : 'unknown error')
    return new Response('Could not generate the PDF', { status: 500 })
  }
}
```

- [ ] **Step 2: Add the download link to the report page**

In `app/app/[churchId]/diagnosis/page.tsx`, the `run` query at `:40` already selects `id`. Add below the `<VerdictHeader …/>` element:

```tsx
      <a
        href={`/api/report/${run!.id}/pdf`}
        className="font-body text-sm text-ink-soft underline underline-offset-4"
      >
        Download PDF
      </a>
```

The `run!` assertion is required and correct: `diagRow` is only assigned inside `if (run)`, and the function already returned `<EmptyState/>` when `diagRow` was null (`:58`) — so `run` is non-null here, but TypeScript cannot narrow one variable from another's nullness. This matches the repo's existing `result!.verdict` style under `noUncheckedIndexedAccess`. Do **not** "fix" this by re-querying or by making the link conditional.

- [ ] **Step 3: Verify the gate**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: tsc 0, eslint 0, all tests pass, build ok. `app/api/report/[runId]/pdf` must appear in the build's route list as a dynamic (`ƒ`) route.

- [ ] **Step 4: Commit**

```bash
git add "app/api/report/[runId]/pdf/route.ts" "app/app/[churchId]/diagnosis/page.tsx"
git commit -m "feat(m5c): serve the report PDF at /api/report/[runId]/pdf"
```

---

## Verification before completion (after all tasks)

Run the full gate, then verify by **generating and opening real files** — the AC is "PDF downloads", which a `200` does not prove.

```bash
npm run typecheck && npm run lint && npm run test && npm run test:db && npm run build
```
Floors: tsc 0 · eslint 0 · vitest 147+ (now ~157 with Tasks 1 and 4) · pgTAP **Files 16 / Tests 154** (unchanged) · build ok.

Then, browser e2e on `http://127.0.0.1:3000` (keep everything on `127.0.0.1` — GoTrue allows only that origin; the preview browser otherwise oscillates to `localhost` with a separate cookie jar):

1. **Admin downloads** → open the file. Valid PDF; church name, verdict, chain, appendix all present; **no respondent names anywhere**.
2. **Viewer downloads** → succeeds (RLS is member-scoped, not admin-scoped).
3. **Non-member requests the same `runId`** → `404`, not `403`.
4. **Signed out** → `401`.
5. **`PROSE_MODE=fallback`** → still generates a complete document.
6. **Fonts survived the production build** — confirm the PDF from `next build && next start` still embeds Fraunces, not a Helvetica fallback. This is the spec §7 risk; a dev-server-only check does not cover it.
