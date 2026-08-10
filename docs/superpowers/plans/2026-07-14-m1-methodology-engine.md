# Cairn M1 — Methodology + Pure Engine + 6 Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Enforce superpowers:test-driven-development on every task.

**Goal:** Populate `/methodology` from the Frameworks doc and build the pure, deterministic `diagnose()` engine plus 6 fixture churches, all before any database exists.

**Architecture:** Five versioned YAML files hold the methodology (questions, rules, benchmarks, offers, fallback copy). A Zod schema validates them at load. A pure pipeline `normalize → score → gap → benchmark → constraint → dispersion → assemble` turns `Response[]` + `Methodology` + `{attendance_band}` into a `Diagnosis` struct. A deterministic fallback renderer turns a `Diagnosis` into a full text report with zero AI. Six fixtures assert the diagnostic *outcomes* (primary constraint, blind spots, generosity mode, dispersion, NO_STRUCTURAL_CONSTRAINT).

**Tech Stack:** TypeScript (ESM), Vitest, `js-yaml`, `zod`. No Next.js, no Supabase, no network — the engine milestone is deliberately dependency-light so the "imports nothing from framework/db/network" acceptance test is structurally guaranteed.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from `docs/XPG-Engineering-Spec.md` and `docs/Cairn-Eight-Category-Frameworks.md`.

- **Prime directive 1 — deterministic engine, additive AI.** `diagnose()` is a pure function. No `import` from `next`, `@supabase/*`, `openai` (or the retired `@anthropic-ai/*`), `fs` (except the loader), or any network client anywhere under `/lib/engine`. No model call decides any number or verdict. The full report must render with `PROSE_MODE=fallback`.
- **Prime directive 3 — methodology is data, not code.** Questions, anchors, thresholds, benchmarks, and offer copy live in `/methodology/*.yaml`. Every `Diagnosis` is stamped `methodology_version` (the `questions.yaml` version, `"0.1.0"`).
- **Question text and anchors are verbatim** from `docs/Cairn-Eight-Category-Frameworks.md`. Invent no wording. (Anchors legitimately contain em-dashes and apostrophes — keep them exactly. The "no em-dashes" rule in Spec §8.2 governs *AI-generated report prose only*, never the source question anchors.)
- **Categories & item IDs (fixed):** stages `guest`(G1–G5), `conn`(C1–C5), `disc`(D1–D5), `vol`(V1–V5), `gen`(GEN1–GEN5), positions 1–5; enablers `gov`(GOV1–5), `comm`(COM1–5), `sys`(SYS1–5), position `null`. 8 categories, 40 items.
- **Thresholds (v0.1, tunable in YAML):** `break: 45`, `severe: 25`, `gate: 45`, `blind_spot_gap: 20`, `dispersion: 2.0`.
- **Scoring:** items are 1–10; `score[cat] = mean(all item values across all respondents) × 10` → 0–100.
- **The engine must be able to return `NO_STRUCTURAL_CONSTRAINT` (primary_constraint = null) and must never manufacture a constraint.**
- **Env strings to honor later (not exercised by M1 tests):** `ANTHROPIC_MODEL_PROSE=claude-sonnet-5`, `ANTHROPIC_MODEL_CLASSIFY=claude-haiku-4-5`, `PROSE_MODE=ai|fallback`, `MONOGRAM_LETTERS=1`. Verify model strings via the `claude-api` skill before any deploy.
- **Commits:** small, one per task. `git init` is Task 1. Conventional-commit messages (`feat:`, `test:`, `chore:`).

## Sign-off gates (STOP and get explicit user approval before locking)

These two gates are folded into the task flow. Do not treat them as done until the user signs off.

1. **belief/evidence tagging (at Task 3 review).** The `signal` tag on every item is validated but needs user sign-off. Full set below — **evidence** = `G1, G2, G4, G5, C2, C3, C5, D3, V1, V2, GEN1`; everything else **belief**; all enabler items **belief**. Flag for the user at Task 3:
   - **disc/D3 tension.** Spec §7.2 uses `disc` as its example of a *no-evidence* category, but the Frameworks `disc` blind-spot trigger uses D3 ("near-zero new leaders"). Resolution baked into this plan: tag **D3 = evidence** (it is a genuine count and it enables the disc blind spot) AND keep `rules.yaml` constraint step 6 so disc's confidence is penalized when it is *primary* (a single evidence item is thin). Note that Spec §7.2's "disc = no evidence" example wording is stale under this tagging.
   - **Enablers all belief** → they correctly produce no gap and can never be blind spots (consistent with "never primary").
2. **benchmark prior values (at Task 5 review).** `benchmarks.yaml` values are **Claude-drafted provisional priors, not observed data.** The `source:` field says so and the report must visibly state scores are benchmarked against priors. Present the full draft table to the user for sign-off before locking.

## File Structure

```
/package.json                 ESM, scripts: test, typecheck
/tsconfig.json                strict, moduleResolution bundler
/vitest.config.ts
/.gitignore
/methodology/
  questions.yaml              8 categories, 40 items, verbatim anchors + signal tags   (Task 3)
  rules.yaml                  chain, gates, generosity split, thresholds, confidence   (Task 4)
  benchmarks.yaml             labeled provisional priors, per band per category         (Task 5)
  offers.yaml                 per-stage offers + generosity(breadth/depth/both) + no_constraint  (Task 6)
  copy.yaml                   deterministic fallback prose templates for 7 blocks + inserts       (Task 6)
/lib/methodology/
  schema.ts                   Zod schemas + inferred Methodology types                  (Task 2)
  load.ts                     load + validate all 5 YAML, fail loudly                    (Task 7)
/lib/engine/                  PURE. no framework, no db, no network.
  types.ts                    Response, Diagnosis (§7.6), intermediate types            (Task 8)
  normalize.ts                group responses by category/item/respondent               (Task 9)
  score.ts                    category score 0-100                                       (Task 10)
  gap.ts                      belief/evidence/gap/gap_class + blind spots                (Task 11)
  benchmark.ts                percentile vs band cohort priors                          (Task 12)
  dispersion.ts               per-respondent stddev, disagreement flag                  (Task 13)
  constraint.ts               the 8-step constraint logic + NO_STRUCTURAL_CONSTRAINT    (Task 14)
  assemble.ts                 build Diagnosis, offer, confidence, evidence_trail         (Task 15)
  index.ts                    export diagnose(responses, methodology, context)          (Task 15)
/lib/ai/
  fallback.ts                 deterministic 7-block prose from Diagnosis + copy.yaml     (Task 16)
/lib/report/
  render.ts                   compose full report text (fallback-render AC)             (Task 17)
/tests/engine/
  helpers.ts                  fixture builders + loadMethodology once                    (Task 18)
  leaky-bucket.test.ts        Fixture 1                                                  (Task 19)
  faithful-remnant.test.ts    Fixture 2 (generosity breadth)                            (Task 20)
  broad-but-shallow.test.ts   Fixture 3 (generosity depth)                              (Task 21)
  founder-bottleneck.test.ts  Fixture 4 (gov gate)                                       (Task 22)
  disagreement.test.ts        Fixture 5 (dispersion)                                     (Task 23)
  healthy-church.test.ts      Fixture 6 (NO_STRUCTURAL_CONSTRAINT) + fallback-render AC  (Task 24)
```

Later milestones (M2+) add `/lib/report/render.tsx` (React), `/lib/ai/{classify,prose}.ts`, `/lib/supabase`, `/lib/brand`, `/supabase/migrations`, `/tests/rls`, and the full Next.js app. **None of those are in M1.**

## Task index

1. Bootstrap the engine workspace (git, TS, Vitest, deps)
2. Methodology Zod schemas + types (`schema.ts`)
3. `questions.yaml` (40 items, verbatim) — **belief/evidence sign-off gate**
4. `rules.yaml`
5. `benchmarks.yaml` — **priors sign-off gate**
6. `offers.yaml` + `copy.yaml`
7. Methodology loader (`load.ts`)
8. Engine types (`types.ts`)
9. `normalize.ts`
10. `score.ts`
11. `gap.ts`
12. `benchmark.ts`
13. `dispersion.ts`
14. `constraint.ts`
15. `assemble.ts` + `index.ts` (`diagnose`)
16. Fallback prose (`fallback.ts`)
17. Report renderer (`render.ts`)
18. Fixture harness (`helpers.ts`)
19. Fixture 1 — Leaky Bucket
20. Fixture 2 — Faithful Remnant (breadth)
21. Fixture 3 — Broad but Shallow (depth)
22. Fixture 4 — Founder Bottleneck (gov gate)
23. Fixture 5 — Disagreement (dispersion)
24. Fixture 6 — Healthy Church (NO_STRUCTURAL_CONSTRAINT) + fallback-render AC

---

### Task 1: Bootstrap the engine workspace

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` and `npm run typecheck` scripts that all later tasks rely on.

- [ ] **Step 1: `git init` and `.gitignore`**

```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
git init
```

`.gitignore`:
```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: `package.json`** (ESM; pin versions rather than `latest`)

```json
{
  "name": "cairn",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "js-yaml": "4.1.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/js-yaml": "4.0.9",
    "@types/node": "20.14.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 3: `tsconfig.json`** (strict, bundler resolution so `.ts` imports work without extensions under Vitest)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["lib", "tests"]
}
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 5: Smoke test** `tests/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';

describe('workspace', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install, run, verify**

Run: `npm install && npm test && npm run typecheck`
Expected: 1 passing test; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: bootstrap engine workspace (ts + vitest)"
```

---

### Task 2: Methodology Zod schemas + inferred types

**Files:**
- Create: `lib/methodology/schema.ts`
- Test: `tests/methodology/schema.test.ts`

**Interfaces:**
- Produces: `Methodology`, `Questions`, `Rules`, `Benchmarks`, `Offers`, `Copy`, `Category`, `Item`, `Offer`, `BandBenchmark`, `Signal`, `CategoryKind`, and the Zod validators `QuestionsSchema`, `RulesSchema`, `BenchmarksSchema`, `OffersSchema`, `CopySchema`. Consumed by `load.ts` (Task 7). The engine imports the *types* only (never the Zod runtime) from here to keep `/lib/engine` framework-free — types erase at compile time, so importing types from a module that also exports Zod is fine, but engine code must not call the schemas.

- [ ] **Step 1: Write the failing test** `tests/methodology/schema.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { QuestionsSchema, RulesSchema } from '../../lib/methodology/schema';

describe('QuestionsSchema', () => {
  it('accepts a minimal valid category', () => {
    const ok = {
      version: '0.1.0',
      categories: [
        { id: 'guest', name: 'Guest Experience', kind: 'stage', position: 1,
          items: [{ id: 'G1', text: 't', signal: 'evidence', anchors: { lo: 'a', mid: 'b', hi: 'c' } }] },
      ],
    };
    expect(() => QuestionsSchema.parse(ok)).not.toThrow();
  });

  it('rejects an unknown signal tag', () => {
    const bad = {
      version: '0.1.0',
      categories: [
        { id: 'guest', name: 'G', kind: 'stage', position: 1,
          items: [{ id: 'G1', text: 't', signal: 'vibe', anchors: { lo: 'a', mid: 'b', hi: 'c' } }] },
      ],
    };
    expect(() => QuestionsSchema.parse(bad)).toThrow();
  });

  it('rejects thresholds missing a field', () => {
    expect(() => RulesSchema.parse({ version: '0.1.0' })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/schema.test.ts`
Expected: FAIL (module not found / exports undefined).

- [ ] **Step 3: Implement `lib/methodology/schema.ts`**

```ts
import { z } from 'zod';

export const SignalSchema = z.enum(['belief', 'evidence']);
export const CategoryKindSchema = z.enum(['stage', 'enabler']);

export const AnchorsSchema = z.object({
  lo: z.string().min(1),
  mid: z.string().min(1),
  hi: z.string().min(1),
});

export const ItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  signal: SignalSchema,
  anchors: AnchorsSchema,
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: CategoryKindSchema,
  position: z.number().int().min(1).max(5).nullable(),
  items: z.array(ItemSchema).min(1),
});

export const QuestionsSchema = z.object({
  version: z.string().min(1),
  categories: z.array(CategorySchema).length(8),
});

export const GatesSchema = z.union([z.literal('all'), z.array(z.string()).min(1)]);

export const RulesSchema = z.object({
  version: z.string().min(1),
  chain: z.array(z.string()).length(5),
  enablers: z.record(z.object({ gates: GatesSchema })),
  generosity: z.object({
    breadth_items: z.array(z.string()).min(1),
    depth_items: z.array(z.string()).min(1),
  }),
  thresholds: z.object({
    break: z.number(),
    severe: z.number(),
    gate: z.number(),
    blind_spot_gap: z.number(),
    dispersion: z.number(),
  }),
  constraint_logic: z.string().min(1),
  confidence: z.object({
    low_response_penalty: z.number(),
    floor: z.number(),
  }),
});

export const BandBenchmarkSchema = z.object({
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
});

export const BenchmarksSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  bands: z.record(z.record(BandBenchmarkSchema)),
});

export const OfferSchema = z.object({
  type: z.string().min(1),
  call_type: z.string().min(1),
  hook: z.string().min(1),
});

export const OffersSchema = z.object({
  version: z.string().min(1),
  stages: z.record(OfferSchema),
  generosity: z.object({
    breadth: OfferSchema,
    depth: OfferSchema,
    both: OfferSchema,
  }),
  no_constraint: OfferSchema,
});

export const CopySchema = z.object({
  version: z.string().min(1),
  blocks: z.record(z.string().min(1)),
  inserts: z.record(z.string().min(1)),
});

export type Signal = z.infer<typeof SignalSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type Anchors = z.infer<typeof AnchorsSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Questions = z.infer<typeof QuestionsSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type BandBenchmark = z.infer<typeof BandBenchmarkSchema>;
export type Benchmarks = z.infer<typeof BenchmarksSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Offers = z.infer<typeof OffersSchema>;
export type Copy = z.infer<typeof CopySchema>;

export interface Methodology {
  questions: Questions;
  rules: Rules;
  benchmarks: Benchmarks;
  offers: Offers;
  copy: Copy;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/methodology/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: methodology zod schemas and inferred types"
```

---

### Task 3: `questions.yaml` (40 items, verbatim) — belief/evidence SIGN-OFF GATE

**Files:**
- Create: `methodology/questions.yaml`
- Test: `tests/methodology/questions.test.ts`

**Interfaces:**
- Consumes: `QuestionsSchema` (Task 2).
- Produces: the canonical question set every later task reads. `methodology_version` = this file's `version` (`"0.1.0"`).

**⚠️ SIGN-OFF GATE:** Before committing, present the `signal` tagging to the user (see the Sign-off gates section). Evidence set = `G1, G2, G4, G5, C2, C3, C5, D3, V1, V2, GEN1`; all else belief. Flag the disc/D3 tension explicitly. Do not lock until approved.

- [ ] **Step 1: Write the failing test** `tests/methodology/questions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { QuestionsSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/questions.yaml', import.meta.url)), 'utf8');
const q = QuestionsSchema.parse(yaml.load(raw));

const EVIDENCE = new Set(['G1','G2','G4','G5','C2','C3','C5','D3','V1','V2','GEN1']);
const byId = Object.fromEntries(q.categories.map(c => [c.id, c]));

describe('questions.yaml', () => {
  it('has 8 categories and 40 items', () => {
    expect(q.categories).toHaveLength(8);
    expect(q.categories.flatMap(c => c.items)).toHaveLength(40);
  });

  it('has the exact stage/enabler shape', () => {
    expect(q.categories.filter(c => c.kind === 'stage').map(c => c.id))
      .toEqual(['guest','conn','disc','vol','gen']);
    expect(q.categories.filter(c => c.kind === 'enabler').map(c => c.id))
      .toEqual(['gov','comm','sys']);
    expect(byId.guest.position).toBe(1);
    expect(byId.gen.position).toBe(5);
    for (const e of ['gov','comm','sys']) expect(byId[e].position).toBeNull();
  });

  it('tags exactly the agreed evidence items and nothing else', () => {
    for (const c of q.categories) {
      for (const it of c.items) {
        const expected = EVIDENCE.has(it.id) ? 'evidence' : 'belief';
        expect(`${it.id}:${it.signal}`).toBe(`${it.id}:${expected}`);
      }
    }
  });

  it('every anchor is non-empty and every item id is well-formed', () => {
    for (const c of q.categories) {
      for (const it of c.items) {
        expect(it.anchors.lo.length).toBeGreaterThan(0);
        expect(it.anchors.mid.length).toBeGreaterThan(0);
        expect(it.anchors.hi.length).toBeGreaterThan(0);
        expect(it.text.length).toBeGreaterThan(10);
      }
    }
  });

  it('spot-checks verbatim wording', () => {
    const g1 = byId.guest.items.find(i => i.id === 'G1')!;
    expect(g1.text).toBe('When a first-time guest visits, what actually happens to their information?');
    expect(g1.anchors.lo).toBe("Nothing. We don't know who visited or how to reach them.");
    const gen1 = byId.gen.items.find(i => i.id === 'GEN1')!;
    expect(gen1.anchors.hi).toBe('More than half of households give.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/questions.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Create `methodology/questions.yaml`** — copy exactly. All strings double-quoted; the only embedded double quotes are in `D4.lo` (escaped as `\"why\"`).

```yaml
version: "0.1.0"
categories:
  - id: guest
    name: "Guest Experience"
    kind: stage
    position: 1
    items:
      - id: G1
        text: "When a first-time guest visits, what actually happens to their information?"
        signal: evidence
        anchors:
          lo: "Nothing. We don't know who visited or how to reach them."
          mid: "We capture some guests (a connection card, a table) but it's inconsistent and no one owns the follow-up."
          hi: "Nearly every first-time guest is captured, and their information reaches a specific person the same week."
      - id: G2
        text: "After a guest visits, how fast and how reliably are they contacted?"
        signal: evidence
        anchors:
          lo: "They aren't, unless they reach out to us first."
          mid: "Sometimes, eventually, by whoever remembers — usually more than a week later."
          hi: "Every captured guest is personally contacted within 48 hours, and one role owns that this happens."
      - id: G3
        text: "Could a guest who wanted to go deeper figure out how, without asking a staff member?"
        signal: belief
        anchors:
          lo: "No. They'd have to know someone or ask."
          mid: "There's a next step (a class, a lunch, an app) but it's easy to miss and we don't point to it clearly."
          hi: "Every guest leaves knowing exactly what to do next, and it's obvious without asking anyone."
      - id: G4
        text: "Do you know what share of first-time guests come back a second time?"
        signal: evidence
        anchors:
          lo: "We have no idea. We don't track it."
          mid: "We have a rough sense but no real number."
          hi: "We know our return rate and can see whether it's moving."
      - id: G5
        text: "Who is responsible for what happens to a guest in their first 30 days?"
        signal: evidence
        anchors:
          lo: "No one. It's nobody's job."
          mid: "It's shared across a few people or a team, so it falls through the cracks."
          hi: "One person owns the 30-day guest journey and is accountable for it."
  - id: conn
    name: "Community / Connection"
    kind: stage
    position: 2
    items:
      - id: C1
        text: "What share of your regular attenders are personally known by someone who is not on paid staff?"
        signal: belief
        anchors:
          lo: "Very few. Most people come and go anonymously."
          mid: "Maybe half. There's a committed core, and a large edge of people no one would notice leaving."
          hi: "Nearly everyone is known and cared for by a non-staff person."
      - id: C2
        text: "What share of adults are in a group, class, or consistent relational community?"
        signal: evidence
        anchors:
          lo: "Under 15%. Groups aren't really a thing here."
          mid: "Around a third. We have groups but most people aren't in one."
          hi: "More than half of adults are in a real group."
      - id: C3
        text: "If a regular attender stopped coming for a month, what would happen?"
        signal: evidence
        anchors:
          lo: "Nothing. No one would notice."
          mid: "Someone might notice eventually, but no one owns reaching out."
          hi: "Someone would notice within a week or two and personally reach out."
      - id: C4
        text: "How does a new person actually get connected into relationship here?"
        signal: belief
        anchors:
          lo: "They're on their own. If they don't force their way in, they stay on the edge."
          mid: "We have a path (groups launch, a class) but it's seasonal or easy to miss."
          hi: "There's a clear, always-available on-ramp and we actively walk people onto it."
      - id: C5
        text: "Is relational life concentrated in a small core, or spread across the body?"
        signal: evidence
        anchors:
          lo: "Everything runs through the same 20 people who've been here for years."
          mid: "There's a core and a slowly growing second ring, but it's still concentrated."
          hi: "Relationship and ownership are spread widely; new people become insiders regularly."
  - id: disc
    name: "Discipleship / Leadership"
    kind: stage
    position: 3
    items:
      - id: D1
        text: "Could your staff describe the path a new believer walks here — and would they describe it the same way?"
        signal: belief
        anchors:
          lo: "No. There's no defined path; everyone would say something different."
          mid: "There's an implicit path a few leaders could sketch, but it's not written or shared."
          hi: "There's a clear, named path, and our leaders would all describe it consistently."
      - id: D2
        text: "Are people visibly maturing — moving from new to grounded to serving to leading?"
        signal: belief
        anchors:
          lo: "Not really. People plateau after they get comfortable."
          mid: "Some are, but it's accidental — the self-motivated ones."
          hi: "We can point to people at every stage and name who's moving."
      - id: D3
        text: "In the last year, how many people moved from being served to leading others?"
        signal: evidence
        anchors:
          lo: "None that I can name."
          mid: "A handful, but it wasn't intentional."
          hi: "Many, through a deliberate pipeline we run."
      - id: D4
        text: "Do your people understand the reasons behind the Christian life, or mostly the behaviors?"
        signal: belief
        anchors:
          lo: "Mostly behaviors and attendance. The \"why\" isn't taught."
          mid: "We teach solid content on Sundays, but it doesn't consistently translate into formed conviction."
          hi: "Our people can articulate why, not just what, and it shows in how they live."
      - id: D5
        text: "If your best disciple-maker left, would formation continue?"
        signal: belief
        anchors:
          lo: "No. It depends on specific gifted individuals."
          mid: "Partly — some of it is systematized, much of it isn't."
          hi: "Yes. Formation runs on a reproducible model, not on heroes."
  - id: vol
    name: "Volunteer"
    kind: stage
    position: 4
    items:
      - id: V1
        text: "What share of your regular adults serve at least once a month?"
        signal: evidence
        anchors:
          lo: "Under 10%. The same few people do everything."
          mid: "Around 20%. A committed group serves; most attend and leave."
          hi: "Over a third serve regularly."
      - id: V2
        text: "Are the same people carrying multiple roles because no one else will step up?"
        signal: evidence
        anchors:
          lo: "Yes. A small group is exhausted and holding everything together."
          mid: "Somewhat — key people are stretched, but it's not yet a crisis."
          hi: "No. Load is spread; no one is carrying three jobs."
      - id: V3
        text: "How easy is it for someone who wants to serve to actually start?"
        signal: belief
        anchors:
          lo: "Hard. They have to know someone or chase it down."
          mid: "Possible, but clunky — an interested person can slip through the cracks."
          hi: "Easy and obvious. A willing person is serving within two weeks."
      - id: V4
        text: "Once someone serves, do they grow — or just fill a slot?"
        signal: belief
        anchors:
          lo: "They fill a slot. There's no development."
          mid: "Some team leaders invest; most don't."
          hi: "Serving is a development path; volunteers grow into leaders."
      - id: V5
        text: "Do your staff primarily do the ministry, or equip others to?"
        signal: belief
        anchors:
          lo: "Staff do it themselves; it's faster than training someone."
          mid: "Mixed — some equip, some are the bottleneck."
          hi: "Staff multiply ministry through volunteers as their main job."
  - id: gen
    name: "Generosity"
    kind: stage
    position: 5
    items:
      - id: GEN1
        text: "What share of your regular households give anything at all in a year?"
        signal: evidence
        anchors:
          lo: "Under 25%. A small minority funds the church."
          mid: "Around 40%. A committed minority gives; most don't."
          hi: "More than half of households give."
      - id: GEN2
        text: "Do your people understand why they give, or mostly where to give?"
        signal: belief
        anchors:
          lo: "Mostly logistics. Generosity isn't taught as formation."
          mid: "We teach on it periodically, usually around budget needs."
          hi: "Generosity is discipled as worship; our people know why, not just where."
      - id: GEN3
        text: "Is generosity of time modeled and celebrated, not just money?"
        signal: belief
        anchors:
          lo: "We mostly talk about money when we talk about giving."
          mid: "We value both but emphasize financial giving."
          hi: "Time and money are both discipled as generosity; we celebrate both."
      - id: GEN4
        text: "Does a person have a clear next step to grow in generosity from wherever they are?"
        signal: belief
        anchors:
          lo: "No. You're either a giver or you're not; there's no path."
          mid: "There's teaching but no personal next step for different starting points."
          hi: "Everyone has a clear next step, whether they've never given or already tithe."
      - id: GEN5
        text: "Is your generosity funding vision, or just keeping the lights on?"
        signal: belief
        anchors:
          lo: "We're in survival mode; giving barely covers operations."
          mid: "We're stable but have little margin for new mission."
          hi: "Generosity funds vision and mission beyond our own walls."
  - id: gov
    name: "Governance / Accountability"
    kind: enabler
    position: null
    items:
      - id: GOV1
        text: "When a real decision needs to be made, is it clear who makes it?"
        signal: belief
        anchors:
          lo: "No. Decisions stall, or everything routes to one person."
          mid: "Mostly clear for routine things, murky for anything hard or new."
          hi: "Clear, understood, and followed at every level."
      - id: GOV2
        text: "Do staff and key leaders know what they own and what they don't?"
        signal: belief
        anchors:
          lo: "No. Roles overlap and things fall through the cracks."
          mid: "Roughly — there are titles, but real ownership is fuzzy."
          hi: "Yes. Everyone knows their lane and their authority."
      - id: GOV3
        text: "When someone (including a leader) underperforms, is it addressed?"
        signal: belief
        anchors:
          lo: "No. We avoid it, especially with long-tenured people."
          mid: "Sometimes, inconsistently, depending on who it is."
          hi: "Yes, directly and fairly, at every level."
      - id: GOV4
        text: "Can the church function and decide when the senior leader is away?"
        signal: belief
        anchors:
          lo: "No. Everything waits for them."
          mid: "Partly — routine things move, big things wait."
          hi: "Yes. Authority is genuinely distributed."
      - id: GOV5
        text: "Does your governing body provide real accountability and wisdom, or rubber-stamp?"
        signal: belief
        anchors:
          lo: "It's a rubber stamp, or a source of dysfunction."
          mid: "It functions, but leans passive or overly deferential."
          hi: "It provides genuine accountability, wisdom, and support."
  - id: comm
    name: "Communication"
    kind: enabler
    position: null
    items:
      - id: COM1
        text: "Could every staff member state this season's top priorities the same way, without checking?"
        signal: belief
        anchors:
          lo: "No. Everyone's working off a different understanding."
          mid: "Roughly aligned, but it drifts and needs re-stating constantly."
          hi: "Yes. Priorities are clear, shared, and current across the team."
      - id: COM2
        text: "Can a newcomer find service times, location, and how to take a next step in under a minute online?"
        signal: belief
        anchors:
          lo: "No. Our digital presence is outdated or confusing."
          mid: "The basics are findable; next steps and depth are not."
          hi: "Yes. Everything a newcomer needs is obvious and current."
      - id: COM3
        text: "Do your people know what matters most, or is everything announced with equal weight?"
        signal: belief
        anchors:
          lo: "Everything's a headline, so nothing is. People tune out."
          mid: "We prioritize somewhat, but over-communicate and dilute the important things."
          hi: "People clearly know what matters most; we protect the main things."
      - id: COM4
        text: "Do you have to say something five times for it to stick?"
        signal: belief
        anchors:
          lo: "Yes. Nothing moves unless we exhaust every channel repeatedly."
          mid: "Important things need heavy repetition to land."
          hi: "Clear communication lands the first or second time."
      - id: COM5
        text: "Do you actually hear back from your congregation, or only talk at them?"
        signal: belief
        anchors:
          lo: "Broadcast only. We don't really know what they're hearing."
          mid: "Some feedback channels, lightly used."
          hi: "Real two-way communication; we know what's landing."
  - id: sys
    name: "Org Structure / Systems"
    kind: enabler
    position: null
    items:
      - id: SYS1
        text: "Do your core processes live in systems, or in specific people's heads?"
        signal: belief
        anchors:
          lo: "In heads. If a key person left, we'd lose how things are done."
          mid: "Some documented, much of it tribal knowledge."
          hi: "Core processes are documented and repeatable, independent of any individual."
      - id: SYS2
        text: "Do your systems (ChMS, giving, communication, scheduling) work together, or is it duct tape?"
        signal: belief
        anchors:
          lo: "Fragmented. Nothing talks to anything; lots of manual re-entry."
          mid: "We have tools, but they're siloed and clunky."
          hi: "Our systems are integrated and reduce manual work."
      - id: SYS3
        text: "When someone new joins (staff or volunteer), is there a repeatable way to bring them in?"
        signal: belief
        anchors:
          lo: "No. Every onboarding is improvised."
          mid: "There's a rough process, inconsistently followed."
          hi: "Yes. Onboarding is defined and consistent."
      - id: SYS4
        text: "Can leadership see what's actually happening (attendance, giving, serving, groups) without a fire drill?"
        signal: belief
        anchors:
          lo: "No. Getting a straight number is a project."
          mid: "We can get some data, with effort."
          hi: "Leadership has current, trustworthy data at hand."
      - id: SYS5
        text: "If you doubled in size, would your systems hold?"
        signal: belief
        anchors:
          lo: "No. We'd break. We're already strained."
          mid: "We'd struggle and have to rebuild on the fly."
          hi: "Our systems would scale with us."
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/methodology/questions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: SIGN-OFF GATE — present belief/evidence tagging to the user. Do not proceed until approved.**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: questions.yaml — 8 categories, 40 verbatim items, signal tags"
```

---

### Task 4: `rules.yaml`

**Files:**
- Create: `methodology/rules.yaml`
- Test: `tests/methodology/rules.test.ts`

**Interfaces:**
- Consumes: `RulesSchema` (Task 2).
- Produces: chain order, enabler gates, generosity split item lists, thresholds, and confidence knobs read by `constraint.ts`, `gap.ts`, `dispersion.ts`, `assemble.ts`.

- [ ] **Step 1: Write the failing test** `tests/methodology/rules.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { RulesSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/rules.yaml', import.meta.url)), 'utf8');
const r = RulesSchema.parse(yaml.load(raw));

describe('rules.yaml', () => {
  it('chain is the five stages in order', () => {
    expect(r.chain).toEqual(['guest','conn','disc','vol','gen']);
  });
  it('enabler gates match the frameworks doc', () => {
    expect(r.enablers.gov.gates).toBe('all');
    expect(r.enablers.comm.gates).toEqual(['guest','conn']);
    expect(r.enablers.sys.gates).toEqual(['vol','disc']);
  });
  it('generosity split is GEN1 breadth vs GEN2/GEN4 depth', () => {
    expect(r.generosity.breadth_items).toEqual(['GEN1']);
    expect(r.generosity.depth_items).toEqual(['GEN2','GEN4']);
  });
  it('thresholds are the locked v0.1 values', () => {
    expect(r.thresholds).toMatchObject({ break: 45, severe: 25, gate: 45, blind_spot_gap: 20, dispersion: 2.0 });
  });
  it('confidence knobs present', () => {
    expect(r.confidence.low_response_penalty).toBe(0.15);
    expect(r.confidence.floor).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/methodology/rules.test.ts` → FAIL (file not found).

- [ ] **Step 3: Create `methodology/rules.yaml`**

```yaml
version: "0.1.0"
chain: [guest, conn, disc, vol, gen]
enablers:
  gov:  { gates: all }
  comm: { gates: [guest, conn] }
  sys:  { gates: [vol, disc] }
generosity:
  breadth_items: [GEN1]
  depth_items: [GEN2, GEN4]
thresholds:
  break: 45
  severe: 25
  gate: 45
  blind_spot_gap: 20
  dispersion: 2.0
constraint_logic: |
  1. score all categories 0-100
  2. walk `chain` in order; a stage is BROKEN if score < thresholds.break
  3. primary_constraint = first broken stage
  4. do_not_work_on = every broken stage AFTER primary in the chain
  5. gating_conditions = enablers with score < thresholds.gate
  6. discipleship (disc) has one evidence item (D3) in v1 -> when disc is primary,
     penalize confidence (low_response_penalty); it may still be primary only if it is
     the earliest break, otherwise it is reported as contributing / do_not_work_on
  7. generosity split: breadth = mean(breadth_items), depth = mean(depth_items);
     both low -> both; only breadth low -> breadth; only depth low -> depth; else null
     (low = mean*10 < thresholds.break)
  8. if no stage is broken -> NO_STRUCTURAL_CONSTRAINT (capacity offer; invent no problem)
confidence:
  low_response_penalty: 0.15
  floor: 0.4
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/methodology/rules.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: rules.yaml — chain, gates, generosity split, thresholds"
```

---

### Task 5: `benchmarks.yaml` — priors SIGN-OFF GATE

**Files:**
- Create: `methodology/benchmarks.yaml`
- Test: `tests/methodology/benchmarks.test.ts`

**Interfaces:**
- Consumes: `BenchmarksSchema` (Task 2).
- Produces: `bands[attendance_band][category] = {p25,p50,p75}` read by `benchmark.ts`. Six bands × 8 categories.

**⚠️ SIGN-OFF GATE:** These are **Claude-drafted provisional priors, not observed data.** Present the full table to the user before committing. The `source:` field and the report must both say so.

- [ ] **Step 1: Write the failing test** `tests/methodology/benchmarks.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { BenchmarksSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/benchmarks.yaml', import.meta.url)), 'utf8');
const b = BenchmarksSchema.parse(yaml.load(raw));

const BANDS = ['under_100','100_249','250_499','500_999','1000_1499','1500_plus'];
const CATS = ['guest','conn','disc','vol','gen','gov','comm','sys'];

describe('benchmarks.yaml', () => {
  it('labels itself as provisional priors', () => {
    expect(b.source.toLowerCase()).toContain('prior');
  });
  it('covers every band and category', () => {
    for (const band of BANDS) {
      expect(b.bands[band], `missing band ${band}`).toBeTruthy();
      for (const cat of CATS) {
        expect(b.bands[band][cat], `missing ${band}.${cat}`).toBeTruthy();
      }
    }
  });
  it('percentiles are monotonic p25 < p50 < p75 and within 0..100', () => {
    for (const band of BANDS) {
      for (const cat of CATS) {
        const { p25, p50, p75 } = b.bands[band][cat];
        expect(p25).toBeGreaterThanOrEqual(0);
        expect(p25).toBeLessThan(p50);
        expect(p50).toBeLessThan(p75);
        expect(p75).toBeLessThanOrEqual(100);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (file not found).

- [ ] **Step 3: Create `methodology/benchmarks.yaml`** — provisional priors (draft for sign-off). Rationale baked in: smaller churches tend lower on systems/measurement and mid on warmth; larger churches higher on systems but can thin out on connection breadth.

```yaml
version: "0.1.0"
source: "XPG priors v0 — provisional, not observed. Replace with observed distributions at n>=200."
bands:
  under_100:
    guest: { p25: 30, p50: 45, p75: 60 }
    conn:  { p25: 38, p50: 55, p75: 70 }
    disc:  { p25: 30, p50: 44, p75: 58 }
    vol:   { p25: 34, p50: 50, p75: 66 }
    gen:   { p25: 30, p50: 44, p75: 60 }
    gov:   { p25: 28, p50: 42, p75: 58 }
    comm:  { p25: 30, p50: 44, p75: 60 }
    sys:   { p25: 22, p50: 36, p75: 52 }
  100_249:
    guest: { p25: 34, p50: 50, p75: 66 }
    conn:  { p25: 36, p50: 52, p75: 68 }
    disc:  { p25: 32, p50: 46, p75: 60 }
    vol:   { p25: 34, p50: 50, p75: 66 }
    gen:   { p25: 32, p50: 46, p75: 62 }
    gov:   { p25: 30, p50: 44, p75: 60 }
    comm:  { p25: 32, p50: 47, p75: 63 }
    sys:   { p25: 26, p50: 40, p75: 56 }
  250_499:
    guest: { p25: 38, p50: 54, p75: 70 }
    conn:  { p25: 34, p50: 50, p75: 66 }
    disc:  { p25: 34, p50: 48, p75: 62 }
    vol:   { p25: 36, p50: 52, p75: 68 }
    gen:   { p25: 34, p50: 48, p75: 64 }
    gov:   { p25: 32, p50: 47, p75: 63 }
    comm:  { p25: 34, p50: 50, p75: 66 }
    sys:   { p25: 30, p50: 45, p75: 61 }
  500_999:
    guest: { p25: 45, p50: 60, p75: 74 }
    conn:  { p25: 38, p50: 52, p75: 66 }
    disc:  { p25: 36, p50: 50, p75: 64 }
    vol:   { p25: 38, p50: 54, p75: 70 }
    gen:   { p25: 36, p50: 50, p75: 66 }
    gov:   { p25: 34, p50: 50, p75: 66 }
    comm:  { p25: 36, p50: 52, p75: 68 }
    sys:   { p25: 34, p50: 50, p75: 66 }
  1000_1499:
    guest: { p25: 48, p50: 63, p75: 77 }
    conn:  { p25: 38, p50: 53, p75: 68 }
    disc:  { p25: 38, p50: 52, p75: 66 }
    vol:   { p25: 40, p50: 56, p75: 72 }
    gen:   { p25: 38, p50: 52, p75: 68 }
    gov:   { p25: 36, p50: 52, p75: 68 }
    comm:  { p25: 38, p50: 54, p75: 70 }
    sys:   { p25: 38, p50: 54, p75: 70 }
  1500_plus:
    guest: { p25: 50, p50: 65, p75: 80 }
    conn:  { p25: 38, p50: 54, p75: 70 }
    disc:  { p25: 40, p50: 54, p75: 68 }
    vol:   { p25: 42, p50: 58, p75: 74 }
    gen:   { p25: 40, p50: 54, p75: 70 }
    gov:   { p25: 38, p50: 54, p75: 70 }
    comm:  { p25: 40, p50: 56, p75: 72 }
    sys:   { p25: 42, p50: 58, p75: 74 }
```

- [ ] **Step 4: Run to verify it passes** — PASS (3 tests).

- [ ] **Step 5: SIGN-OFF GATE — present the priors table to the user. Do not proceed until approved.**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: benchmarks.yaml — provisional XPG priors v0 (6 bands x 8 cats)"
```

---

### Task 6: `offers.yaml` + `copy.yaml`

**Files:**
- Create: `methodology/offers.yaml`, `methodology/copy.yaml`
- Test: `tests/methodology/offers-copy.test.ts`

**Interfaces:**
- Consumes: `OffersSchema`, `CopySchema` (Task 2).
- Produces: per-stage offers + generosity(breadth/depth/both) + `no_constraint` offer (read by `assemble.ts` offer selection); 7 deterministic fallback prose `blocks` + 3 `inserts` (read by `fallback.ts`). `no_constraint` and `generosity.both` are Claude-drafted (labeled). Copy register: plain, warm-but-precise, sentence case, active voice, **no em-dashes** (Spec §8.2 governs AI/fallback report prose).

- [ ] **Step 1: Write the failing test** `tests/methodology/offers-copy.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { OffersSchema, CopySchema } from '../../lib/methodology/schema';

const offersRaw = readFileSync(fileURLToPath(new URL('../../methodology/offers.yaml', import.meta.url)), 'utf8');
const copyRaw = readFileSync(fileURLToPath(new URL('../../methodology/copy.yaml', import.meta.url)), 'utf8');
const offers = OffersSchema.parse(yaml.load(offersRaw));
const copy = CopySchema.parse(yaml.load(copyRaw));

describe('offers.yaml', () => {
  it('has the four stage offers plus generosity and no_constraint', () => {
    expect(Object.keys(offers.stages).sort()).toEqual(['conn', 'disc', 'guest', 'vol']);
    expect(offers.no_constraint.type).toBe('capacity');
    expect(offers.generosity.depth.call_type).toBe('Generosity Culture & Discipleship Review');
  });
  it('keeps the guest hook verbatim', () => {
    expect(offers.stages.guest.hook).toBe("You may be paying for guests you aren't keeping.");
  });
});

describe('copy.yaml', () => {
  it('has the seven blocks and three inserts', () => {
    expect(Object.keys(copy.blocks).sort()).toEqual(
      ['blind_spot', 'cost', 'do_not_work_on', 'evidence', 'next_step', 'verdict', 'verdict_no_constraint'],
    );
    expect(Object.keys(copy.inserts).sort()).toEqual(['benchmark_note', 'dispersion', 'gating']);
  });
  it('verdict references the primary-name token', () => {
    expect(copy.blocks.verdict).toContain('{primary_name}');
  });
  it('the benchmark note states scores are vs provisional priors', () => {
    expect(copy.inserts.benchmark_note.toLowerCase()).toContain('prior');
  });
  it('contains no em-dashes anywhere (register rule)', () => {
    const all = [...Object.values(copy.blocks), ...Object.values(copy.inserts)].join('\n');
    expect(all).not.toContain('—'); // em-dash
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/offers-copy.test.ts`
Expected: FAIL (files not found).

- [ ] **Step 3: Create `methodology/offers.yaml`** (`no_constraint` + `generosity.both` are Claude-drafted; the rest are verbatim from the Frameworks "Offer" sections)

```yaml
version: "0.1.0"
stages:
  guest: { type: "guest_retention", call_type: "Guest Retention Diagnostic", hook: "You may be paying for guests you aren't keeping." }
  conn:  { type: "belonging", call_type: "Belonging & Assimilation Review", hook: "Your church may feel more connected than it is." }
  disc:  { type: "discipleship_pipeline", call_type: "Discipleship Pathway & Leadership Pipeline Session", hook: "Your ceiling isn't your building. It's the number of people who can lead." }
  vol:   { type: "volunteer_mobilization", call_type: "Volunteer Mobilization Session", hook: "You may be one burnout away from three ministries stopping." }
generosity:
  depth:   { type: "generosity_depth", call_type: "Generosity Culture & Discipleship Review", hook: "Most of your people give. Few have been taught why." }
  breadth: { type: "generosity_breadth_routes_upstream", call_type: "Belonging & Assimilation Review", hook: "Your givers are generous; there just aren't enough of them, and that's a connection problem." }
  both:    { type: "generosity_depth", call_type: "Generosity Culture & Discipleship Review", hook: "Most of your people give. Few have been taught why." }
# Claude-drafted (no source offer for the no-constraint path):
no_constraint: { type: "capacity", call_type: "Capacity & Next-Ceiling Session", hook: "Nothing here is broken. Let's talk about the ceiling you'll hit next, not the one you're hitting now." }
```

- [ ] **Step 4: Create `methodology/copy.yaml`** (deterministic fallback templates; `{token}` placeholders interpolated by `fallback.ts`; no em-dashes)

```yaml
version: "0.1.0"
blocks:
  verdict: "Your primary constraint is {primary_name}. It scored {primary_score} out of 100, below the point where a stage is working. Everything after it in the chain will look weak until this is fixed."
  verdict_no_constraint: "Nothing in your chain is broken. Every stage is holding. This is a capacity conversation, not a repair one."
  evidence: "Here is what that score rests on: {evidence_lines}."
  blind_spot: "You rated {bs_name} highly, but the countable side tells a different story. Belief sits at {bs_belief}, the evidence at {bs_evidence}, a gap of {bs_gap} points."
  cost: "Left alone, {primary_name} caps everything downstream. Spending on {downstream_list} first raises numbers once and changes nothing."
  do_not_work_on: "Do not work on these yet, they are symptoms of the constraint above: {do_not_list}."
  next_step: "Start with {primary_name}. {offer_hook}"
inserts:
  gating: "Before this can hold, address {gating_list}. These are the ground the fix stands on."
  dispersion: "Your leaders do not agree on {disp_name}. Answers ranged across {disp_spread} points. That disagreement is itself the finding."
  benchmark_note: "Benchmarks are XPG provisional priors, not an observed cohort yet."
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/methodology/offers-copy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: offers.yaml + copy.yaml — offers and deterministic fallback prose"
```

---

### Task 7: Methodology loader (`load.ts`)

**Files:**
- Create: `lib/methodology/load.ts`
- Test: `tests/methodology/load.test.ts`

**Interfaces:**
- Consumes: the five YAML files (Tasks 3–6) and the five Zod schemas (Task 2).
- Produces: `loadMethodology(dir?: string): Methodology` — reads + validates all five files, throwing loudly with the file name on any Zod error. `dir` defaults to the repo `methodology/` directory; tests pass an override. This is the **only** `fs` user in the codebase; `/lib/engine` never imports it.

- [ ] **Step 1: Write the failing test** `tests/methodology/load.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMethodology } from '../../lib/methodology/load';

describe('loadMethodology', () => {
  it('loads all five methodology files', () => {
    const m = loadMethodology();
    expect(m.questions.version).toBe('0.1.0');
    expect(m.rules.chain).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
    expect(m.offers.no_constraint.type).toBe('capacity');
    expect(Object.keys(m.copy.blocks).length).toBeGreaterThan(0);
  });

  it('throws with the file name when a file is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cairn-bad-'));
    writeFileSync(join(dir, 'questions.yaml'), 'version: 1\nnope: true\n');
    expect(() => loadMethodology(dir)).toThrow(/questions\.yaml/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/methodology/load.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/methodology/load.ts`**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  QuestionsSchema,
  RulesSchema,
  BenchmarksSchema,
  OffersSchema,
  CopySchema,
  type Methodology,
} from './schema';

const DEFAULT_DIR = fileURLToPath(new URL('../../methodology', import.meta.url));

export function loadMethodology(dir: string = DEFAULT_DIR): Methodology {
  const read = (file: string): unknown => {
    const full = path.join(dir, file);
    let raw: string;
    try {
      raw = readFileSync(full, 'utf8');
    } catch (e) {
      throw new Error(`loadMethodology: cannot read ${file} at ${full}: ${(e as Error).message}`);
    }
    return yaml.load(raw);
  };

  const parse = <T>(schema: { parse: (u: unknown) => T }, file: string): T => {
    try {
      return schema.parse(read(file));
    } catch (e) {
      throw new Error(`loadMethodology: ${file} failed validation: ${(e as Error).message}`);
    }
  };

  return {
    questions: parse(QuestionsSchema, 'questions.yaml'),
    rules: parse(RulesSchema, 'rules.yaml'),
    benchmarks: parse(BenchmarksSchema, 'benchmarks.yaml'),
    offers: parse(OffersSchema, 'offers.yaml'),
    copy: parse(CopySchema, 'copy.yaml'),
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/methodology/load.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: methodology loader — load + validate all five yaml, fail loudly"
```

---

### Task 8: Engine types (`types.ts`)

**Files:**
- Create: `lib/engine/types.ts`
- Test: `tests/engine/types.test.ts`

**Interfaces:**
- Consumes: `CategoryKind`, `Offer` **types** from `../methodology/schema` (type-only import — never the Zod runtime, keeping `/lib/engine` framework-free).
- Produces: `Response`, `Context`, `NormalizedCategory`, `GapClass`, `CategoryState`, `GenerosityMode`, `DiagnosisCategory`, `BlindSpot`, `DispersionFlag`, `DoNotWorkOn`, `GatingCondition`, `EvidenceRef`, `EvidenceReceipt`, and the top-level `Diagnosis` (shape per Spec §7.6). Every later engine/report task imports these. The fixtures assert on these exact field names, so this file is the single source of truth for the payload shape — reconcile any field-name difference against Spec §7.6 here, before writing consumers.

- [ ] **Step 1: Write the failing test** `tests/engine/types.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import type { Diagnosis } from '../../lib/engine/types';

describe('engine types', () => {
  it('a Diagnosis object satisfies the §7.6 shape', () => {
    const d: Diagnosis = {
      methodology_version: '0.1.0',
      overall_score: 0,
      categories: [],
      primary_constraint: null,
      contributing: [],
      do_not_work_on: [],
      gating_conditions: [],
      generosity_mode: null,
      blind_spots: [],
      dispersion_flags: [],
      offer: { type: 't', call_type: 'c', hook: 'h' },
      confidence: 1,
      evidence_trail: [],
    };
    expect(d.methodology_version).toBe('0.1.0');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/types.test.ts` → FAIL (module not found). (This test also fails `npm run typecheck` until the type exists, which is the real gate.)

- [ ] **Step 3: Implement `lib/engine/types.ts`**

```ts
import type { CategoryKind, Offer } from '../methodology/schema';

export interface Response {
  category_id: string;
  item_id: string;
  value: number; // 1..10
  respondent_label: string;
}

export interface Context {
  attendance_band: string;
}

export interface NormalizedCategory {
  category_id: string;
  itemValues: Map<string, number[]>; // item_id -> values across all respondents
  respondentMeans: Array<{ label: string; mean: number }>;
  respondentCount: number;
}

export type GapClass = 'blind_spot' | 'underrated' | 'calibrated' | null;
export type CategoryState = 'ok' | 'watch' | 'broken' | 'gate';
export type GenerosityMode = 'breadth' | 'depth' | 'both' | null;

export interface DiagnosisCategory {
  category_id: string;
  kind: CategoryKind;
  score: number; // 0..100
  belief: number | null;
  evidence: number | null;
  gap: number | null;
  gap_class: GapClass;
  cohort_percentile: number | null;
  state: CategoryState;
  respondent_count: number;
}

export interface BlindSpot {
  category_id: string;
  belief: number;
  evidence: number;
  gap: number;
}

export interface DispersionFlag {
  category_id: string;
  respondents: Array<{ label: string; mean: number }>;
  spread: number; // population stddev of respondent means, 0..10 scale
}

export interface DoNotWorkOn {
  category_id: string;
  reason: string;
}

export interface GatingCondition {
  enabler_id: string;
  note: string;
}

export interface EvidenceRef {
  kind: 'item' | 'metric';
  ref: string;
  value: number | null;
}

export interface EvidenceReceipt {
  claim: string;
  refs: EvidenceRef[];
}

export interface Diagnosis {
  methodology_version: string;
  overall_score: number;
  categories: DiagnosisCategory[];
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
  blind_spots: BlindSpot[];
  dispersion_flags: DispersionFlag[];
  offer: Offer;
  confidence: number;
  evidence_trail: EvidenceReceipt[];
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/types.test.ts && npm run typecheck` → PASS + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine types — Response, Context, Diagnosis (§7.6)"
```

---

### Task 9: `normalize.ts`

**Files:**
- Create: `lib/engine/normalize.ts`
- Test: `tests/engine/normalize.test.ts`

**Interfaces:**
- Consumes: `Response`, `NormalizedCategory` (Task 8); `Methodology` type (Task 2).
- Produces: `normalize(responses: Response[], methodology: Methodology): Map<string, NormalizedCategory>`. One entry per methodology category (even empty), each holding per-item value arrays, per-respondent means (mean of the items that respondent answered in the category), and the distinct-respondent count.

- [ ] **Step 1: Write the failing test** `tests/engine/normalize.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { normalize } from '../../lib/engine/normalize';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();

describe('normalize', () => {
  it('groups by item and computes per-respondent means', () => {
    const responses: Response[] = [];
    for (const it of ['G1', 'G2', 'G3', 'G4', 'G5']) {
      responses.push({ category_id: 'guest', item_id: it, value: 6, respondent_label: 'A' });
      responses.push({ category_id: 'guest', item_id: it, value: 4, respondent_label: 'B' });
    }
    const norm = normalize(responses, m).get('guest')!;
    expect(norm.itemValues.get('G1')).toEqual([6, 4]);
    expect(norm.respondentCount).toBe(2);
    expect(norm.respondentMeans.map(r => r.mean).sort()).toEqual([4, 6]);
  });

  it('produces an empty-but-present entry for unanswered categories', () => {
    const norm = normalize([], m);
    expect(norm.has('sys')).toBe(true);
    expect(norm.get('sys')!.respondentCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/normalize.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/normalize.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { Response, NormalizedCategory } from './types';

export function normalize(
  responses: Response[],
  methodology: Methodology,
): Map<string, NormalizedCategory> {
  const result = new Map<string, NormalizedCategory>();

  for (const cat of methodology.questions.categories) {
    const itemValues = new Map<string, number[]>();
    for (const it of cat.items) itemValues.set(it.id, []);

    const perRespondent = new Map<string, number[]>();

    for (const r of responses) {
      if (r.category_id !== cat.id) continue;
      const bucket = itemValues.get(r.item_id);
      if (!bucket) continue; // ignore values for unknown items
      bucket.push(r.value);
      const rb = perRespondent.get(r.respondent_label);
      if (rb) rb.push(r.value);
      else perRespondent.set(r.respondent_label, [r.value]);
    }

    const respondentMeans = [...perRespondent.entries()].map(([label, vals]) => ({
      label,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));

    result.set(cat.id, {
      category_id: cat.id,
      itemValues,
      respondentMeans,
      respondentCount: perRespondent.size,
    });
  }

  return result;
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/normalize.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine normalize — group responses by category/item/respondent"
```

---

### Task 10: `score.ts`

**Files:**
- Create: `lib/engine/score.ts`
- Test: `tests/engine/score.test.ts`

**Interfaces:**
- Consumes: `NormalizedCategory` (Task 8).
- Produces: `scoreCategory(norm: NormalizedCategory): number` = `round(mean(all item values across all respondents) * 10)`, 0..100; 0 when no values.

- [ ] **Step 1: Write the failing test** `tests/engine/score.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scoreCategory } from '../../lib/engine/score';
import type { NormalizedCategory } from '../../lib/engine/types';

function norm(itemMap: Record<string, number[]>): NormalizedCategory {
  return {
    category_id: 'x',
    itemValues: new Map(Object.entries(itemMap)),
    respondentMeans: [],
    respondentCount: 0,
  };
}

describe('scoreCategory', () => {
  it('all sixes → 60', () => {
    expect(scoreCategory(norm({ a: [6], b: [6], c: [6] }))).toBe(60);
  });
  it('mixed values → mean × 10, rounded', () => {
    expect(scoreCategory(norm({ a: [8], b: [2], c: [2], d: [2], e: [2] }))).toBe(32);
  });
  it('no values → 0', () => {
    expect(scoreCategory(norm({ a: [], b: [] }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/score.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/score.ts`**

```ts
import type { NormalizedCategory } from './types';

export function scoreCategory(norm: NormalizedCategory): number {
  const all: number[] = [];
  for (const vals of norm.itemValues.values()) all.push(...vals);
  if (all.length === 0) return 0;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  return Math.round(mean * 10);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/score.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine score — category score 0-100"
```

---

### Task 11: `gap.ts`

**Files:**
- Create: `lib/engine/gap.ts`
- Test: `tests/engine/gap.test.ts`

**Interfaces:**
- Consumes: `NormalizedCategory`, `GapClass` (Task 8); `Category` type (Task 2).
- Produces: `gapFor(norm, category, blindSpotGap): GapResult` where `GapResult = { belief: number|null; evidence: number|null; gap: number|null; gap_class: GapClass }`. belief/evidence are `round(mean(values)*10)`; gap = belief − evidence when both present; `gap_class` = `blind_spot` if gap ≥ `blindSpotGap`, `underrated` if gap ≤ −`blindSpotGap`, else `calibrated`; all null when the category has no evidence items (all enablers) or no belief items.

- [ ] **Step 1: Write the failing test** `tests/engine/gap.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { gapFor } from '../../lib/engine/gap';
import type { NormalizedCategory } from '../../lib/engine/types';

const m = loadMethodology();
const guest = m.questions.categories.find(c => c.id === 'guest')!;
const gov = m.questions.categories.find(c => c.id === 'gov')!;

function normFor(values: Record<string, number>): NormalizedCategory {
  const itemValues = new Map<string, number[]>();
  for (const [k, v] of Object.entries(values)) itemValues.set(k, [v]);
  return { category_id: 'x', itemValues, respondentMeans: [], respondentCount: 1 };
}

describe('gapFor', () => {
  it('belief high, evidence low → blind spot', () => {
    // guest: belief = G3, evidence = G1,G2,G4,G5
    const g = gapFor(normFor({ G1: 2, G2: 2, G3: 8, G4: 2, G5: 2 }), guest, 20);
    expect(g.belief).toBe(80);
    expect(g.evidence).toBe(20);
    expect(g.gap).toBe(60);
    expect(g.gap_class).toBe('blind_spot');
  });

  it('an all-belief enabler has no evidence and no gap', () => {
    const g = gapFor(normFor({ GOV1: 7, GOV2: 7, GOV3: 7, GOV4: 7, GOV5: 7 }), gov, 20);
    expect(g.evidence).toBeNull();
    expect(g.gap).toBeNull();
    expect(g.gap_class).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/gap.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/gap.ts`**

```ts
import type { Category } from '../methodology/schema';
import type { NormalizedCategory, GapClass } from './types';

export interface GapResult {
  belief: number | null;
  evidence: number | null;
  gap: number | null;
  gap_class: GapClass;
}

export function gapFor(
  norm: NormalizedCategory,
  category: Category,
  blindSpotGap: number,
): GapResult {
  const meanOf = (signal: 'belief' | 'evidence'): number | null => {
    const vals: number[] = [];
    for (const it of category.items) {
      if (it.signal !== signal) continue;
      const v = norm.itemValues.get(it.id);
      if (v) vals.push(...v);
    }
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10);
  };

  const belief = meanOf('belief');
  const evidence = meanOf('evidence');

  if (belief === null || evidence === null) {
    return { belief, evidence, gap: null, gap_class: null };
  }

  const gap = belief - evidence;
  let gap_class: GapClass;
  if (gap >= blindSpotGap) gap_class = 'blind_spot';
  else if (gap <= -blindSpotGap) gap_class = 'underrated';
  else gap_class = 'calibrated';

  return { belief, evidence, gap, gap_class };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/gap.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine gap — belief/evidence gap and blind-spot classification"
```

---

### Task 12: `benchmark.ts`

**Files:**
- Create: `lib/engine/benchmark.ts`
- Test: `tests/engine/benchmark.test.ts`

**Interfaces:**
- Consumes: `Methodology` type (Task 2); `BandBenchmark` shape `{p25,p50,p75}`.
- Produces: `percentile(value, band): number` — piecewise-linear across anchors `(0,0),(p25,25),(p50,50),(p75,75),(100,100)`, clamped 0..100, rounded. `benchmarkFor(categoryId, value, methodology, attendanceBand): number` — throws loudly on an unknown band or missing category priors.

- [ ] **Step 1: Write the failing test** `tests/engine/benchmark.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { percentile, benchmarkFor } from '../../lib/engine/benchmark';

const m = loadMethodology();

describe('percentile', () => {
  const band = { p25: 40, p50: 55, p75: 70 };
  it('lands exactly on the anchor percentiles', () => {
    expect(percentile(40, band)).toBe(25);
    expect(percentile(55, band)).toBe(50);
    expect(percentile(70, band)).toBe(75);
  });
  it('interpolates between anchors', () => {
    expect(percentile(20, band)).toBe(13); // halfway from (0,0) to (40,25) → 12.5 → 13
  });
  it('clamps outside the range', () => {
    expect(percentile(-5, band)).toBe(0);
    expect(percentile(200, band)).toBe(100);
  });
});

describe('benchmarkFor', () => {
  it('uses the band + category priors', () => {
    const p = benchmarkFor('guest', 60, m, '500_999'); // p50 = 60 → 50
    expect(p).toBe(50);
  });
  it('throws on an unknown band', () => {
    expect(() => benchmarkFor('guest', 60, m, 'nope')).toThrow(/attendance_band/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/benchmark.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/benchmark.ts`**

```ts
import type { Methodology, BandBenchmark } from '../methodology/schema';

export function percentile(value: number, band: BandBenchmark): number {
  const xs = [0, band.p25, band.p50, band.p75, 100];
  const ys = [0, 25, 50, 75, 100];
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const y0 = ys[i]!;
    const y1 = ys[i + 1]!;
    if (value >= x0 && value <= x1) {
      if (x1 === x0) return y0;
      return Math.round(y0 + ((value - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return 100;
}

export function benchmarkFor(
  categoryId: string,
  value: number,
  methodology: Methodology,
  attendanceBand: string,
): number {
  const band = methodology.benchmarks.bands[attendanceBand];
  if (!band) throw new Error(`benchmark: unknown attendance_band "${attendanceBand}"`);
  const priors = band[categoryId];
  if (!priors) throw new Error(`benchmark: no priors for "${categoryId}" in band "${attendanceBand}"`);
  return percentile(value, priors);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/benchmark.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine benchmark — piecewise-linear percentile vs band priors"
```

---

### Task 13: `dispersion.ts`

**Files:**
- Create: `lib/engine/dispersion.ts`
- Test: `tests/engine/dispersion.test.ts`

**Interfaces:**
- Consumes: `NormalizedCategory`, `DispersionFlag` (Task 8).
- Produces: `dispersionFor(norm, threshold): DispersionFlag | null` — population stddev of `respondentMeans` (0..10 scale); returns a flag (with both respondent labels/means and the rounded spread) only when `respondentCount > 1 && stddev >= threshold`; otherwise `null`.

- [ ] **Step 1: Write the failing test** `tests/engine/dispersion.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { dispersionFor } from '../../lib/engine/dispersion';
import type { NormalizedCategory } from '../../lib/engine/types';

function norm(means: Array<{ label: string; mean: number }>): NormalizedCategory {
  return { category_id: 'disc', itemValues: new Map(), respondentMeans: means, respondentCount: means.length };
}

describe('dispersionFor', () => {
  it('flags wide disagreement', () => {
    const f = dispersionFor(norm([{ label: 'A', mean: 8 }, { label: 'B', mean: 3 }]), 2.0);
    expect(f).not.toBeNull();
    expect(f!.spread).toBeCloseTo(2.5, 5);
    expect(f!.respondents.map(r => r.label).sort()).toEqual(['A', 'B']);
  });
  it('does not flag near-agreement', () => {
    expect(dispersionFor(norm([{ label: 'A', mean: 8 }, { label: 'B', mean: 7 }]), 2.0)).toBeNull();
  });
  it('never flags a single respondent', () => {
    expect(dispersionFor(norm([{ label: 'A', mean: 8 }]), 2.0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/dispersion.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/dispersion.ts`**

```ts
import type { NormalizedCategory, DispersionFlag } from './types';

export function dispersionFor(
  norm: NormalizedCategory,
  threshold: number,
): DispersionFlag | null {
  const means = norm.respondentMeans;
  if (means.length <= 1) return null;
  const vals = means.map(m => m.mean);
  const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length; // population
  const stddev = Math.sqrt(variance);
  if (stddev < threshold) return null;
  return {
    category_id: norm.category_id,
    respondents: means.map(m => ({ label: m.label, mean: m.mean })),
    spread: Math.round(stddev * 100) / 100,
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/dispersion.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine dispersion — per-respondent stddev disagreement flag"
```

---

### Task 14: `constraint.ts`

**Files:**
- Create: `lib/engine/constraint.ts`
- Test: `tests/engine/constraint.test.ts`

**Interfaces:**
- Consumes: `Methodology` type (Task 2); `DoNotWorkOn`, `GatingCondition`, `GenerosityMode` (Task 8).
- Produces: `analyzeConstraint(scores, generosityMeans, methodology, categoryNames): ConstraintResult` where
  `ConstraintResult = { primary_constraint: {category_id:string}|null; contributing: string[]; do_not_work_on: DoNotWorkOn[]; gating_conditions: GatingCondition[]; generosity_mode: GenerosityMode }`,
  `scores: Map<string, number>`, `generosityMeans: { breadth: number|null; depth: number|null }` (1..10 scale, from GEN1 vs GEN2/GEN4), `categoryNames: Map<string, string>`. Implements the 8-step constraint logic: walk `chain`, first stage with `score < break` is primary; broken stages after it are `contributing` + `do_not_work_on` (reason `"downstream symptom of <primaryName>"`); enablers with `score < gate` become gating conditions; generosity mode from the breadth/depth means (`low = mean*10 < break`); no broken stage → `NO_STRUCTURAL_CONSTRAINT` (primary null).

- [ ] **Step 1: Write the failing test** `tests/engine/constraint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { analyzeConstraint } from '../../lib/engine/constraint';

const m = loadMethodology();
const names = new Map(m.questions.categories.map(c => [c.id, c.name]));
const scoresOf = (o: Record<string, number>) => {
  const map = new Map<string, number>();
  for (const c of m.questions.categories) map.set(c.id, o[c.id] ?? 70);
  return map;
};
const noGen = { breadth: null, depth: null };

describe('analyzeConstraint', () => {
  it('first broken stage is primary; later broken stages are do_not_work_on', () => {
    const r = analyzeConstraint(scoresOf({ guest: 30, conn: 30, disc: 30 }), noGen, m, names);
    expect(r.primary_constraint?.category_id).toBe('guest');
    expect(r.do_not_work_on.map(x => x.category_id)).toEqual(['conn', 'disc']);
    expect(r.contributing).toEqual(['conn', 'disc']);
    expect(r.do_not_work_on[0]!.reason).toContain('Guest Experience');
  });

  it('no broken stage → NO_STRUCTURAL_CONSTRAINT', () => {
    const r = analyzeConstraint(scoresOf({}), noGen, m, names);
    expect(r.primary_constraint).toBeNull();
    expect(r.do_not_work_on).toEqual([]);
  });

  it('an enabler below gate becomes a gating condition', () => {
    const r = analyzeConstraint(scoresOf({ gov: 30 }), noGen, m, names);
    expect(r.gating_conditions.map(g => g.enabler_id)).toContain('gov');
  });

  it('generosity split: only breadth low → breadth; both low → both', () => {
    expect(analyzeConstraint(scoresOf({}), { breadth: 2, depth: 7 }, m, names).generosity_mode).toBe('breadth');
    expect(analyzeConstraint(scoresOf({}), { breadth: 2, depth: 2 }, m, names).generosity_mode).toBe('both');
    expect(analyzeConstraint(scoresOf({}), { breadth: 7, depth: 2 }, m, names).generosity_mode).toBe('depth');
    expect(analyzeConstraint(scoresOf({}), { breadth: 7, depth: 7 }, m, names).generosity_mode).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/constraint.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/constraint.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { DoNotWorkOn, GatingCondition, GenerosityMode } from './types';

export interface ConstraintResult {
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
}

const GATING_NOTES: Record<string, string> = {
  gov: 'Whatever you fix will not hold until governance is addressed.',
  comm: 'Communication gates the front of the chain; upstream fixes will not land clearly until it improves.',
  sys: 'Systems gate volunteer and discipleship capacity; those fixes will not scale until systems hold.',
};

function generosityMode(
  means: { breadth: number | null; depth: number | null },
  breakThreshold: number,
): GenerosityMode {
  const breadthLow = means.breadth !== null && means.breadth * 10 < breakThreshold;
  const depthLow = means.depth !== null && means.depth * 10 < breakThreshold;
  if (breadthLow && depthLow) return 'both';
  if (breadthLow) return 'breadth';
  if (depthLow) return 'depth';
  return null;
}

export function analyzeConstraint(
  scores: Map<string, number>,
  generosityMeans: { breadth: number | null; depth: number | null },
  methodology: Methodology,
  categoryNames: Map<string, string>,
): ConstraintResult {
  const { chain, enablers, thresholds } = methodology.rules;

  const broken = chain.filter(id => (scores.get(id) ?? 0) < thresholds.break);
  const primaryId = broken.length > 0 ? broken[0]! : null;
  const primary_constraint = primaryId ? { category_id: primaryId } : null;
  const primaryIndex = primaryId ? chain.indexOf(primaryId) : -1;

  const primaryName = primaryId ? (categoryNames.get(primaryId) ?? primaryId) : '';
  const downstream = broken.filter(id => chain.indexOf(id) > primaryIndex);
  const do_not_work_on: DoNotWorkOn[] = downstream.map(id => ({
    category_id: id,
    reason: `downstream symptom of ${primaryName}`,
  }));
  const contributing = downstream.slice();

  const gating_conditions: GatingCondition[] = [];
  for (const enablerId of Object.keys(enablers)) {
    if ((scores.get(enablerId) ?? 0) < thresholds.gate) {
      gating_conditions.push({
        enabler_id: enablerId,
        note: GATING_NOTES[enablerId] ?? `${enablerId} gates part of the chain.`,
      });
    }
  }

  return {
    primary_constraint,
    contributing,
    do_not_work_on,
    gating_conditions,
    generosity_mode: generosityMode(generosityMeans, thresholds.break),
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/constraint.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: engine constraint — 8-step chain logic + NO_STRUCTURAL_CONSTRAINT"
```

---

### Task 15: `assemble.ts` + `index.ts` (`diagnose`)

**Files:**
- Create: `lib/engine/assemble.ts`, `lib/engine/index.ts`
- Test: `tests/engine/diagnose.test.ts`

**Interfaces:**
- Consumes: everything above — `normalize` (9), `scoreCategory` (10), `gapFor` (11), `benchmarkFor` (12), `dispersionFor` (13), `analyzeConstraint` (14); `Methodology`, `Category`, `Offer` types.
- Produces: `assemble(normalized, methodology, context): Diagnosis` and `diagnose(responses, methodology, context): Diagnosis` (exported from `index.ts`). `assemble` runs per-category score/gap/benchmark/dispersion, computes the generosity means from the `gen` category, calls the constraint analyzer, then selects the offer, computes confidence, `overall_score` (mean of the 8 scores, rounded — appendix only), and the deterministic `evidence_trail`.
  - **offer selection:** primary null → `offers.no_constraint`; primary `gen` → `offers.generosity[mode]` (mode `both`/`depth`→depth offer, `breadth`→breadth offer, null→depth offer as fallback); else → `offers.stages[primary.category_id]`.
  - **confidence:** start 1.0; primary present with `respondent_count === 1` → −`low_response_penalty`; primary === `disc` → another −`low_response_penalty`; clamp to `floor`. No primary → `max(floor, 1 − low_response_penalty * (anySingleRespondentCategory ? 1 : 0))`.
  - **category state:** stage → `broken` if `score < break`, else `watch` if `cohort_percentile != null && percentile < 25`, else `ok`. enabler → `gate` if `score < gate`, else `watch` if `percentile < 25`, else `ok`.

- [ ] **Step 1: Write the failing test** `tests/engine/diagnose.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, value: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value, respondent_label: 'Pastor' }));
}
const responses: Response[] = [
  ...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
  ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7),
];

describe('diagnose end-to-end', () => {
  const d = diagnose(responses, m, { attendance_band: '500_999' });
  it('returns all eight categories and stamps the methodology version', () => {
    expect(d.categories).toHaveLength(8);
    expect(d.methodology_version).toBe('0.1.0');
  });
  it('identifies the broken first stage as primary and selects its offer', () => {
    expect(d.primary_constraint?.category_id).toBe('guest');
    expect(d.offer.type).toBe('guest_retention');
  });
  it('builds a primary evidence receipt', () => {
    expect(d.evidence_trail.some(r => r.claim === 'primary_constraint:guest')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/diagnose.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/engine/assemble.ts`**

```ts
import type { Methodology, Category, Offer } from '../methodology/schema';
import type {
  NormalizedCategory,
  Context,
  Diagnosis,
  DiagnosisCategory,
  CategoryState,
  BlindSpot,
  DispersionFlag,
  EvidenceReceipt,
} from './types';
import { scoreCategory } from './score';
import { gapFor } from './gap';
import { benchmarkFor } from './benchmark';
import { dispersionFor } from './dispersion';
import { analyzeConstraint, type ConstraintResult } from './constraint';

interface Thresholds {
  break: number;
  gate: number;
  blind_spot_gap: number;
  dispersion: number;
}

function categoryState(
  cat: Category,
  score: number,
  percentile: number | null,
  t: Thresholds,
): CategoryState {
  if (cat.kind === 'stage') {
    if (score < t.break) return 'broken';
    if (percentile !== null && percentile < 25) return 'watch';
    return 'ok';
  }
  if (score < t.gate) return 'gate';
  if (percentile !== null && percentile < 25) return 'watch';
  return 'ok';
}

function meanOfItems(norm: NormalizedCategory, ids: string[]): number | null {
  const vals: number[] = [];
  for (const id of ids) {
    const v = norm.itemValues.get(id);
    if (v) vals.push(...v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function itemMean10(norm: NormalizedCategory, id: string): number | null {
  const vals = norm.itemValues.get(id) ?? [];
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) : null;
}

function selectOffer(constraint: ConstraintResult, methodology: Methodology): Offer {
  const primary = constraint.primary_constraint;
  if (!primary) return methodology.offers.no_constraint;
  if (primary.category_id === 'gen') {
    const mode = constraint.generosity_mode;
    if (mode === 'breadth') return methodology.offers.generosity.breadth;
    if (mode === 'both') return methodology.offers.generosity.both;
    return methodology.offers.generosity.depth; // depth or null fallback
  }
  const stageOffer = methodology.offers.stages[primary.category_id];
  if (!stageOffer) throw new Error(`assemble: no offer for stage "${primary.category_id}"`);
  return stageOffer;
}

function computeConfidence(
  constraint: ConstraintResult,
  categories: DiagnosisCategory[],
  methodology: Methodology,
): number {
  const { low_response_penalty, floor } = methodology.rules.confidence;
  const primary = constraint.primary_constraint;
  if (!primary) {
    const anySingle = categories.some(c => c.respondent_count === 1);
    return Math.max(floor, 1 - low_response_penalty * (anySingle ? 1 : 0));
  }
  let conf = 1.0;
  const primaryCat = categories.find(c => c.category_id === primary.category_id);
  if (primaryCat && primaryCat.respondent_count === 1) conf -= low_response_penalty;
  if (primary.category_id === 'disc') conf -= low_response_penalty;
  return Math.max(floor, conf);
}

function buildEvidenceTrail(
  constraint: ConstraintResult,
  blindSpots: BlindSpot[],
  dispersionFlags: DispersionFlag[],
  normalized: Map<string, NormalizedCategory>,
  methodology: Methodology,
): EvidenceReceipt[] {
  const trail: EvidenceReceipt[] = [];

  const primary = constraint.primary_constraint;
  if (primary) {
    const cat = methodology.questions.categories.find(c => c.id === primary.category_id)!;
    const norm = normalized.get(primary.category_id)!;
    trail.push({
      claim: `primary_constraint:${primary.category_id}`,
      refs: cat.items.map(it => ({ kind: 'item', ref: it.id, value: itemMean10(norm, it.id) })),
    });
  }

  for (const bs of blindSpots) {
    trail.push({
      claim: `blind_spot:${bs.category_id}`,
      refs: [
        { kind: 'metric', ref: `${bs.category_id}.belief`, value: bs.belief },
        { kind: 'metric', ref: `${bs.category_id}.evidence`, value: bs.evidence },
      ],
    });
  }

  for (const d of dispersionFlags) {
    trail.push({
      claim: `dispersion:${d.category_id}`,
      refs: d.respondents.map(r => ({
        kind: 'metric',
        ref: `${d.category_id}.${r.label}`,
        value: Math.round(r.mean * 10) / 10,
      })),
    });
  }

  if (constraint.generosity_mode) {
    const genNorm = normalized.get('gen')!;
    const ids = [
      ...methodology.rules.generosity.breadth_items,
      ...methodology.rules.generosity.depth_items,
    ];
    trail.push({
      claim: `generosity_mode:${constraint.generosity_mode}`,
      refs: ids.map(id => ({ kind: 'metric', ref: id, value: itemMean10(genNorm, id) })),
    });
  }

  return trail;
}

export function assemble(
  normalized: Map<string, NormalizedCategory>,
  methodology: Methodology,
  context: Context,
): Diagnosis {
  const t = methodology.rules.thresholds;
  const categoryNames = new Map(methodology.questions.categories.map(c => [c.id, c.name]));

  const scores = new Map<string, number>();
  const categories: DiagnosisCategory[] = [];
  const blind_spots: BlindSpot[] = [];
  const dispersion_flags: DispersionFlag[] = [];

  for (const cat of methodology.questions.categories) {
    const norm = normalized.get(cat.id)!;
    const score = scoreCategory(norm);
    scores.set(cat.id, score);

    const g = gapFor(norm, cat, t.blind_spot_gap);
    const cohort_percentile = benchmarkFor(cat.id, score, methodology, context.attendance_band);
    const state = categoryState(cat, score, cohort_percentile, t);

    categories.push({
      category_id: cat.id,
      kind: cat.kind,
      score,
      belief: g.belief,
      evidence: g.evidence,
      gap: g.gap,
      gap_class: g.gap_class,
      cohort_percentile,
      state,
      respondent_count: norm.respondentCount,
    });

    if (g.gap_class === 'blind_spot' && g.belief !== null && g.evidence !== null && g.gap !== null) {
      blind_spots.push({ category_id: cat.id, belief: g.belief, evidence: g.evidence, gap: g.gap });
    }

    const disp = dispersionFor(norm, t.dispersion);
    if (disp) dispersion_flags.push(disp);
  }

  const genNorm = normalized.get('gen')!;
  const generosityMeans = {
    breadth: meanOfItems(genNorm, methodology.rules.generosity.breadth_items),
    depth: meanOfItems(genNorm, methodology.rules.generosity.depth_items),
  };

  const constraint = analyzeConstraint(scores, generosityMeans, methodology, categoryNames);

  const overall_score = Math.round(
    [...scores.values()].reduce((a, b) => a + b, 0) / scores.size,
  );

  return {
    methodology_version: methodology.questions.version,
    overall_score,
    categories,
    primary_constraint: constraint.primary_constraint,
    contributing: constraint.contributing,
    do_not_work_on: constraint.do_not_work_on,
    gating_conditions: constraint.gating_conditions,
    generosity_mode: constraint.generosity_mode,
    blind_spots,
    dispersion_flags,
    offer: selectOffer(constraint, methodology),
    confidence: computeConfidence(constraint, categories, methodology),
    evidence_trail: buildEvidenceTrail(constraint, blind_spots, dispersion_flags, normalized, methodology),
  };
}
```

- [ ] **Step 4: Implement `lib/engine/index.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { Response, Context, Diagnosis } from './types';
import { normalize } from './normalize';
import { assemble } from './assemble';

export type { Response, Context, Diagnosis } from './types';

export function diagnose(
  responses: Response[],
  methodology: Methodology,
  context: Context,
): Diagnosis {
  const normalized = normalize(responses, methodology);
  return assemble(normalized, methodology, context);
}
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run tests/engine/diagnose.test.ts && npm run typecheck` → PASS (3 tests) + typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: engine assemble + diagnose — compose Diagnosis, offer, confidence, evidence trail"
```

---

### Task 16: Fallback prose (`fallback.ts`)

**Files:**
- Create: `lib/ai/fallback.ts`
- Test: `tests/ai/fallback.test.ts`

**Interfaces:**
- Consumes: `Diagnosis` (Task 8), `Methodology` (Task 2). Reads `copy.yaml` blocks/inserts.
- Produces: `fallbackProse(d, methodology): ReportBlocks` where `ReportBlocks = { verdict: string; evidence?: string; blind_spot?: string; cost?: string; do_not_work_on?: string; next_step: string; gating?: string; dispersion?: string; benchmark_note: string }`. Pure, deterministic; interpolates the copy templates with Diagnosis values (primary category name via questions lookup, scores, evidence lines from the primary receipt, blind-spot numbers, downstream list, gating list, dispersion). NO_STRUCTURAL_CONSTRAINT → uses `verdict_no_constraint`, skips cost/do_not_work_on/blind_spot. Every `{token}` present in a used template is guaranteed a value (no leftover braces).

- [ ] **Step 1: Write the failing test** `tests/ai/fallback.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor' }));
}

describe('fallbackProse', () => {
  it('interpolates every token (no leftover braces) for a broken chain', () => {
    const d = diagnose(
      [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
       ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
      m, { attendance_band: '500_999' },
    );
    const blocks = fallbackProse(d, m);
    for (const v of Object.values(blocks)) {
      if (typeof v === 'string') {
        expect(v.length).toBeGreaterThan(0);
        expect(v).not.toContain('{');
      }
    }
    expect(blocks.verdict).toContain('Guest Experience');
  });

  it('uses the no-constraint verdict when nothing is broken', () => {
    const d = diagnose(
      [...cat('guest', 7), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
       ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
      m, { attendance_band: '500_999' },
    );
    const blocks = fallbackProse(d, m);
    expect(blocks.verdict).toBe(m.copy.blocks.verdict_no_constraint);
    expect(blocks.cost).toBeUndefined();
    expect(blocks.next_step).not.toContain('{');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/ai/fallback.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/ai/fallback.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';

export interface ReportBlocks {
  verdict: string;
  evidence?: string;
  blind_spot?: string;
  cost?: string;
  do_not_work_on?: string;
  next_step: string;
  gating?: string;
  dispersion?: string;
  benchmark_note: string;
}

function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? vars[k]! : `{${k}}`));
}

function listJoin(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function fallbackProse(d: Diagnosis, methodology: Methodology): ReportBlocks {
  const { blocks, inserts } = methodology.copy;
  const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const benchmark_note = inserts.benchmark_note!;

  if (!d.primary_constraint) {
    return {
      verdict: blocks.verdict_no_constraint!,
      next_step: interp(blocks.next_step!, { primary_name: 'your next ceiling', offer_hook: d.offer.hook }),
      benchmark_note,
    };
  }

  const primaryId = d.primary_constraint.category_id;
  const primaryName = nameOf(primaryId);
  const primaryCat = d.categories.find(c => c.category_id === primaryId)!;

  const primaryReceipt = d.evidence_trail.find(r => r.claim === `primary_constraint:${primaryId}`);
  const evidence_lines = primaryReceipt
    ? primaryReceipt.refs.map(r => `${r.ref} ${r.value ?? 'n/a'}`).join(', ')
    : 'the item-level scores for this stage';

  const verdict = interp(blocks.verdict!, { primary_name: primaryName, primary_score: String(primaryCat.score) });
  const evidence = interp(blocks.evidence!, { evidence_lines });

  let blind_spot: string | undefined;
  const bs = d.blind_spots.find(b => b.category_id === primaryId) ?? d.blind_spots[0];
  if (bs) {
    blind_spot = interp(blocks.blind_spot!, {
      bs_name: nameOf(bs.category_id),
      bs_belief: String(bs.belief),
      bs_evidence: String(bs.evidence),
      bs_gap: String(bs.gap),
    });
  }

  const downstreamNames = d.do_not_work_on.map(x => nameOf(x.category_id));
  const cost = interp(blocks.cost!, {
    primary_name: primaryName,
    downstream_list: downstreamNames.length ? listJoin(downstreamNames) : 'the stages downstream',
  });

  const do_not_work_on = downstreamNames.length
    ? interp(blocks.do_not_work_on!, { do_not_list: listJoin(downstreamNames) })
    : undefined;

  const gating = d.gating_conditions.length
    ? interp(inserts.gating!, { gating_list: listJoin(d.gating_conditions.map(g => nameOf(g.enabler_id))) })
    : undefined;

  const disp = d.dispersion_flags[0];
  const dispersion = disp
    ? interp(inserts.dispersion!, { disp_name: nameOf(disp.category_id), disp_spread: String(disp.spread) })
    : undefined;

  const next_step = interp(blocks.next_step!, { primary_name: primaryName, offer_hook: d.offer.hook });

  return { verdict, evidence, blind_spot, cost, do_not_work_on, next_step, gating, dispersion, benchmark_note };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/ai/fallback.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: fallback prose — deterministic report blocks from copy.yaml"
```

---

### Task 17: Report renderer (`render.ts`)

**Files:**
- Create: `lib/report/render.ts`
- Test: `tests/report/render.test.ts`

**Interfaces:**
- Consumes: `Diagnosis` (Task 8), `ReportBlocks` (Task 16), `Methodology` (Task 2).
- Produces: `renderReportText(d, blocks, methodology): string` — composes the full plain-text report: verdict → evidence → blind_spot → cost → do_not_work_on → gating → dispersion → next_step → offer line (`call_type` + `hook`) → appendix (all 8 category scores tagged stage-N/enabler) → benchmark note. (The React `render.tsx` is a later milestone.)

- [ ] **Step 1: Write the failing test** `tests/report/render.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import { renderReportText } from '../../lib/report/render';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor' }));
}
const d = diagnose(
  [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
   ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
  m, { attendance_band: '500_999' },
);
const text = renderReportText(d, fallbackProse(d, m), m);

describe('renderReportText', () => {
  it('includes the primary name and the offer call type', () => {
    expect(text).toContain('Guest Experience');
    expect(text).toContain(d.offer.call_type);
  });
  it('has an appendix line for every category and states the priors basis', () => {
    for (const c of m.questions.categories) expect(text).toContain(c.name);
    expect(text.toLowerCase()).toContain('prior');
  });
  it('leaves no un-interpolated tokens', () => {
    expect(text).not.toContain('{');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/report/render.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/report/render.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';
import type { ReportBlocks } from '../ai/fallback';

export function renderReportText(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
): string {
  const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
  const chain = methodology.rules.chain;
  const lines: string[] = [];

  lines.push(blocks.verdict);
  if (blocks.evidence) lines.push(blocks.evidence);
  if (blocks.blind_spot) lines.push(blocks.blind_spot);
  if (blocks.cost) lines.push(blocks.cost);
  if (blocks.do_not_work_on) lines.push(blocks.do_not_work_on);
  if (blocks.gating) lines.push(blocks.gating);
  if (blocks.dispersion) lines.push(blocks.dispersion);
  lines.push(blocks.next_step);

  lines.push('');
  lines.push(`Recommended next step: ${d.offer.call_type}. ${d.offer.hook}`);

  lines.push('');
  lines.push('Appendix - all category scores (0-100):');
  for (const c of d.categories) {
    const idx = chain.indexOf(c.category_id);
    const tag = idx >= 0 ? `stage ${idx + 1}` : 'enabler';
    lines.push(`- ${names.get(c.category_id) ?? c.category_id} (${tag}): ${c.score}`);
  }

  lines.push('');
  lines.push(blocks.benchmark_note);

  return lines.join('\n');
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/report/render.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: report renderer — full plain-text report from Diagnosis + blocks"
```

---

### Task 18: Fixture harness (`helpers.ts`)

**Files:**
- Create: `tests/engine/helpers.ts`
- Test: `tests/engine/helpers.test.ts`

**Interfaces:**
- Consumes: `loadMethodology` (Task 7); `Response` (Task 8).
- Produces: `loadFixtureMethodology(): Methodology` (loads once, cached); `answers(methodology, categoryId, valueOrMap, label='Pastor'): Response[]` — builds a `Response` for every item in a category, uniform value or a per-item `Record<itemId, number>` (missing items default to 5); `buildResponses(...groups: Response[][]): Response[]`. Keeps fixture bodies terse.

- [ ] **Step 1: Write the failing test** `tests/engine/helpers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, buildResponses } from './helpers';

const m = loadFixtureMethodology();

describe('fixture helpers', () => {
  it('answers() builds one response per item, uniform value', () => {
    const rs = answers(m, 'guest', 7);
    expect(rs).toHaveLength(5);
    expect(rs.every(r => r.value === 7 && r.category_id === 'guest')).toBe(true);
    expect(rs.every(r => r.respondent_label === 'Pastor')).toBe(true);
  });
  it('answers() honors a per-item map and a custom label', () => {
    const rs = answers(m, 'guest', { G1: 2, G3: 8 }, 'Elder');
    const byId = Object.fromEntries(rs.map(r => [r.item_id, r.value]));
    expect(byId.G1).toBe(2);
    expect(byId.G3).toBe(8);
    expect(byId.G2).toBe(5); // default for unspecified items
    expect(rs.every(r => r.respondent_label === 'Elder')).toBe(true);
  });
  it('buildResponses() flattens groups', () => {
    expect(buildResponses(answers(m, 'guest', 7), answers(m, 'conn', 3))).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/engine/helpers.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `tests/engine/helpers.ts`**

```ts
import { loadMethodology } from '../../lib/methodology/load';
import type { Methodology } from '../../lib/methodology/schema';
import type { Response } from '../../lib/engine/types';

let cached: Methodology | null = null;

export function loadFixtureMethodology(): Methodology {
  if (!cached) cached = loadMethodology();
  return cached;
}

export function answers(
  methodology: Methodology,
  categoryId: string,
  valueOrMap: number | Record<string, number>,
  label = 'Pastor',
): Response[] {
  const cat = methodology.questions.categories.find(c => c.id === categoryId);
  if (!cat) throw new Error(`answers: unknown category "${categoryId}"`);
  return cat.items.map(it => ({
    category_id: categoryId,
    item_id: it.id,
    value: typeof valueOrMap === 'number' ? valueOrMap : (valueOrMap[it.id] ?? 5),
    respondent_label: label,
  }));
}

export function buildResponses(...groups: Response[][]): Response[] {
  return groups.flat();
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/engine/helpers.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: fixture harness — loadFixtureMethodology + answers + buildResponses"
```

---

### Task 19: Fixture 1 — Leaky Bucket

**Files:**
- Test: `tests/engine/leaky-bucket.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15).
- Produces: outcome assertions only (primary constraint, blind spot, offer) — not exact decimals.

Design: guest belief item G3=8, evidence G1,G2,G4,G5=2 → guest score `mean(2,2,8,2,2)*10 = 32` (broken), belief 80 vs evidence 20 = gap 60 (blind_spot). Downstream stages low too; enablers healthy so the story is guest. Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/leaky-bucket.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', { G1: 2, G2: 2, G3: 8, G4: 2, G5: 2 }),
    ...answers(m, 'conn', 3),
    ...answers(m, 'disc', 3),
    ...answers(m, 'vol', 3),
    ...answers(m, 'gen', 3),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Leaky Bucket', () => {
  it('primary constraint is guest', () => {
    expect(d.primary_constraint?.category_id).toBe('guest');
  });
  it('guest is a blind spot (belief far above evidence)', () => {
    expect(d.blind_spots.map(b => b.category_id)).toContain('guest');
    const gbs = d.blind_spots.find(b => b.category_id === 'guest')!;
    expect(gbs.belief).toBeGreaterThan(gbs.evidence);
  });
  it('offer is guest retention', () => {
    expect(d.offer.type).toBe('guest_retention');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/leaky-bucket.test.ts` → PASS (3 tests). (If it fails, the engine is wrong, not the fixture — debug the engine.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 1 — Leaky Bucket (guest primary + blind spot)"
```

---

### Task 20: Fixture 2 — Faithful Remnant (generosity breadth)

**Files:**
- Test: `tests/engine/faithful-remnant.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15).

Design: guest healthy (7); conn broken (3) → primary conn; disc/vol healthy (7); generosity broken with breadth low — GEN1(breadth)=2, GEN2/GEN4(depth)=7, GEN3/GEN5=2 → gen score `mean(2,7,2,7,2)*10 = 40` (broken, downstream of conn). generosity_mode=`breadth` (breadth mean 2 low, depth mean 7 healthy). Because primary is conn, the offer is the conn belonging offer even though the generosity mode is reported. Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/faithful-remnant.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 3),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', { GEN1: 2, GEN2: 7, GEN3: 2, GEN4: 7, GEN5: 2 }),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Faithful Remnant (breadth)', () => {
  it('primary constraint is conn', () => {
    expect(d.primary_constraint?.category_id).toBe('conn');
  });
  it('generosity is downstream and marked do-not-work-on', () => {
    expect(d.do_not_work_on.map(x => x.category_id)).toContain('gen');
  });
  it('generosity mode is breadth', () => {
    expect(d.generosity_mode).toBe('breadth');
  });
  it('offer routes to the conn belonging offer', () => {
    expect(d.offer.type).toBe('belonging');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/faithful-remnant.test.ts` → PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 2 — Faithful Remnant (conn primary, generosity breadth)"
```

---

### Task 21: Fixture 3 — Broad but Shallow (generosity depth)

**Files:**
- Test: `tests/engine/broad-but-shallow.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15).

Design: guest, conn, disc, vol all healthy (7); generosity is the first and only break with depth low — GEN1(breadth)=7, GEN2/GEN4(depth)=2, GEN3/GEN5=2 → gen score `mean(7,2,2,2,2)*10 = 30` (broken) → primary gen. generosity_mode=`depth`; offer = Generosity Culture & Discipleship Review. Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/broad-but-shallow.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', { GEN1: 7, GEN2: 2, GEN3: 2, GEN4: 2, GEN5: 2 }),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Broad but Shallow (depth)', () => {
  it('primary constraint is generosity', () => {
    expect(d.primary_constraint?.category_id).toBe('gen');
  });
  it('generosity mode is depth', () => {
    expect(d.generosity_mode).toBe('depth');
  });
  it('offer is the generosity depth call', () => {
    expect(d.offer.call_type).toBe('Generosity Culture & Discipleship Review');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/broad-but-shallow.test.ts` → PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 3 — Broad but Shallow (gen primary, generosity depth)"
```

---

### Task 22: Fixture 4 — Founder Bottleneck (gov gate)

**Files:**
- Test: `tests/engine/founder-bottleneck.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15).

Design: guest/conn/disc healthy (7), vol broken (3) → primary vol, gen healthy (7); governance failing (gov=3 → score 30 < gate) so it surfaces as a gating condition that will hold back whatever is fixed. Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/founder-bottleneck.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 3),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 3),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Founder Bottleneck (gov gate)', () => {
  it('primary constraint is volunteer', () => {
    expect(d.primary_constraint?.category_id).toBe('vol');
  });
  it('governance is a gating condition', () => {
    expect(d.gating_conditions.map(g => g.enabler_id)).toContain('gov');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/founder-bottleneck.test.ts` → PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 4 — Founder Bottleneck (vol primary, gov gate)"
```

---

### Task 23: Fixture 5 — Disagreement (dispersion)

**Files:**
- Test: `tests/engine/disagreement.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15).

Design: two respondents answer discipleship — Pastor A all 8, Pastor B all 3 → per-respondent means 8 and 3, population stddev 2.5 (≥ 2.0 threshold) → dispersion flag on disc. disc category score = `mean(all 10 values)*10 = 55` (healthy), and every other category is a single healthy respondent (7), so the chain is otherwise fine and the disagreement is the finding (no structural constraint). Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/disagreement.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 8, 'Pastor A'),
    ...answers(m, 'disc', 3, 'Pastor B'),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Disagreement (dispersion)', () => {
  it('flags discipleship dispersion with both respondents', () => {
    const f = d.dispersion_flags.find(x => x.category_id === 'disc');
    expect(f).toBeTruthy();
    expect(f!.spread).toBeCloseTo(2.5, 5);
    expect(f!.respondents.map(r => r.label).sort()).toEqual(['Pastor A', 'Pastor B']);
  });
  it('the chain is otherwise healthy (dispersion is the story)', () => {
    expect(d.primary_constraint).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/disagreement.test.ts` → PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 5 — Disagreement (disc dispersion, chain healthy)"
```

---

### Task 24: Fixture 6 — Healthy Church (NO_STRUCTURAL_CONSTRAINT) + fallback-render AC

**Files:**
- Test: `tests/engine/healthy-church.test.ts`

**Interfaces:**
- Consumes: `loadFixtureMethodology`, `answers` (Task 18); `diagnose` (Task 15); `fallbackProse` (Task 16); `renderReportText` (Task 17).

Design: every category a single healthy respondent (7) → every score 70, at or above every band `p50`, no gaps, nothing broken. Asserts the engine returns `NO_STRUCTURAL_CONSTRAINT` (primary null, empty do_not_work_on, capacity offer) and invents no blind spot. This task also carries the **M1 headline acceptance**: the full report renders with `PROSE_MODE=fallback` (no model), containing the no-constraint verdict, the capacity offer, the appendix, and the benchmark-priors note, with no leftover `{` tokens. Band `500_999`.

- [ ] **Step 1: Write the fixture test** `tests/engine/healthy-church.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { diagnose } from '../../lib/engine/index';
import { fallbackProse } from '../../lib/ai/fallback';
import { renderReportText } from '../../lib/report/render';

const m = loadFixtureMethodology();
const d = diagnose(
  [
    ...answers(m, 'guest', 7),
    ...answers(m, 'conn', 7),
    ...answers(m, 'disc', 7),
    ...answers(m, 'vol', 7),
    ...answers(m, 'gen', 7),
    ...answers(m, 'gov', 7),
    ...answers(m, 'comm', 7),
    ...answers(m, 'sys', 7),
  ],
  m,
  { attendance_band: '500_999' },
);

describe('Fixture: Healthy Church (NO_STRUCTURAL_CONSTRAINT)', () => {
  it('has no primary constraint and no do-not-work-on', () => {
    expect(d.primary_constraint).toBeNull();
    expect(d.do_not_work_on).toEqual([]);
  });
  it('offers the capacity conversation', () => {
    expect(d.offer.type).toBe('capacity');
  });
  it('invents no blind spot', () => {
    expect(d.blind_spots).toEqual([]);
  });

  it('renders a full report with PROSE_MODE=fallback (M1 acceptance)', () => {
    const text = renderReportText(d, fallbackProse(d, m), m);
    expect(text).not.toContain('{'); // every token interpolated
    expect(text.toLowerCase()).toContain('capacity'); // no-constraint verdict / capacity offer
    expect(text).toContain(d.offer.call_type);
    for (const c of m.questions.categories) expect(text).toContain(c.name); // appendix
    expect(text.toLowerCase()).toContain('prior'); // benchmarks are provisional priors
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/healthy-church.test.ts` → PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: fixture 6 — Healthy Church (NO_STRUCTURAL_CONSTRAINT) + fallback-render AC"
```

---

### M1 Acceptance — final closeout

Run after Task 24. This is the milestone gate, not a new task with its own commit.

- [ ] **Full suite green** — `npm test` → all methodology + engine unit tests and all 6 fixtures pass.
- [ ] **Typecheck clean** — `npm run typecheck` → exits 0.
- [ ] **Engine purity** — the engine imports nothing from framework/db/network:

```bash
! grep -rnE "from '(next|@supabase/[^']+|@anthropic-ai/[^']+|openai(/[^']+)?|node:fs|node:http|node:https|node:net|axios|node-fetch)'" lib/engine
```

Expected: no matches, exit 0 (the leading `!` inverts grep, so a clean engine passes). If anything prints, that import is a prime-directive-1 violation — move it out of `/lib/engine`.

- [ ] **Fallback-render acceptance** — confirmed by the Healthy Church fixture's final test: `renderReportText(diagnose(...), fallbackProse(...))` returns a complete report with zero AI and no leftover tokens.

Once all four boxes are checked, M1 is complete. **Do not start M2 (database).** M2 is blocked on the open invited-leader-accounts decision (account is not church membership; likely a `profiles` table 1:1 with `auth.users`) — resolve that with the user first.
