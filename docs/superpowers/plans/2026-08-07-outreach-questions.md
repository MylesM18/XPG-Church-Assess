# Outreach Questions (Methodology 0.2.0 → 0.3.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 outreach-focused assessment questions (methodology 0.3.0), an optional per-question free-text reflection that surfaces unattributed in the report as "Voices on outreach", and version-aware scoring so pre-0.3.0 runs keep working untouched.

**Architecture:** The engine stays byte-untouched — the lever is its *input*: a new `effectiveMethodologyForRun()` deep-filters items a run predates before normalize/gate/score (candidate 4). Reflections travel per-element inside the existing `submit_self_response` jsonb array, land in a new `responses.reflection` column, and ride into the report view as an `outreachVoices` group per dossier area (screen + PDF only — the shared surface is excluded at three independent layers: SQL, row type, audience gate). Closed-window members on pre-0.3.0 runs are exempted from the new items in dashboard progress via `isExemptMember()`.

**Tech Stack:** Next.js (App Router server components + server actions), Supabase (SQL migrations + pgTAP, owner-applied), zod (`zod/v4`), vitest, @react-pdf/renderer.

**Spec:** `docs/superpowers/specs/2026-08-07-outreach-questions-design.md` (approved by Natalie, commit `cfe2bc5`).

---

## ⚠️ Two locked deviations from the spec's letter — FLAGGED FOR NATALIE

Both were resolved during plan-time verification and are baked into this plan. They preserve the spec's intent; the letter changes. **Natalie: please confirm you're comfortable with both before (or while) execution proceeds.**

### Deviation 1 — Effective methodology per run ("candidate 4"), not a gate-only exemption

The engine's fit math is 5-of-5: `AreaFit.n` counts only respondents with a complete rectangle, partials are excluded from `mu`, and `fitArea` silently ignores unknown item_ids. A gate-only exemption would make a closed-window member incomplete against the *grown* item list ⇒ dropped from scoring ⇒ `n=0, mu=0` ⇒ a score-0 broken report.

Instead, wherever scoring/gating runs, if the run's `methodology_version` predates 0.3.0 (`null` / `'0.1.0'` / `'0.2.0'`), we feed the engine an **effective methodology**: a deep-filtered copy that drops items the run predates, stamped `questions.version = '0.2.0'`. Runs ≥ 0.3.0 get the current methodology unchanged (same object reference). `'0.2.0'` names the *test edition*, not the run's birthday. Consequences: old runs' diagnoses stamp `'0.2.0'` (assemble stamps whatever version it's given); open members' answers to new items drop out of pre-0.3.0 scoring automatically via `fitArea`'s unknown-id skip; freeze semantics (`responseHash` + `save_diagnosis`) are preserved; the engine, `normalize.ts`, and `lib/coverage/diagnosis-gate.ts` stay byte-unchanged.

### Deviation 2 — Reflection travels per-element in the jsonb array, not as a trailing SQL arg

The spec's literal trailing `p_reflection text` can't carry two reflections in one whole-category submit (Guest Experience has G6+G7, Communication has COM6+COM7). Faithful adaptation preserving the intent ("text travels in the same call as the rating"): an optional `reflection` key per element of the existing jsonb array — `{item_id, value, reflection?}`. The SQL arg signature stays `(uuid, text, jsonb)` ⇒ plain `CREATE OR REPLACE`. The function validates per element (trim → empty→NULL → reject >2000 with `raise exception`) and writes reflection on insert AND in the on-conflict update, so a re-answer with no text clears old text — matching the form's prefill-both/submit-both behavior.

### Accepted conservative mismatch (documented, not a bug)

Member-level exemption lives ONLY in dashboard matrix totals + viewer personal progress. The admin church-wide header/"N of 8" is NOT exempted. Edge: a pre-0.3.0 run where a category's only respondent is an OPEN-window member who answered exactly the old items → the dashboard cell shows `partial` and blocks the button while the report path would pass. It blocks in the safe direction. Accepted.

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **No new dependencies.** zod imports are `from 'zod/v4'`.
- **Byte-unchanged files/regions (hard locks):** `lib/engine/*`; the `normalize` module imported by `lib/report/derive.ts`; `lib/coverage/diagnosis-gate.ts`; the `get_shared_report` SQL function; `ReportBody` in `app/app/[churchId]/diagnosis/report/shared.tsx` (incl. its stale branch); the two `ReportBody` version props at `app/app/[churchId]/diagnosis/page.tsx:154-157` (`storedVersion={methodology.questions.version}` / `currentVersion={methodology.questions.version}` — both keep the *current* methodology object).
- **Never** run `npm run test:db`, `supabase db push`, or `supabase db reset`. Migrations + pgTAP are **owner-applied** (Natalie). Write them; do not execute them.
- **Never** merge or push to `master`. Do **NOT** push `feat/outreach-questions` (re-check `gh pr view` before any eventual push — Natalie decides).
- **Git hygiene:** stage by explicit path only. Never stage `.claude/`, `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`, or `docs/superpowers/plans/2026-08-01-assessment-deadlines.md` (untracked strays). Prefix `GIT_LITERAL_PATHSPECS=1` on any git command whose path contains `[churchId]`/`[categoryId]`.
- **Do NOT** convert the responses RPCs to `current_run()` — the `20260730000100` header deliberately keeps inline run resolution ("convert in a follow-up under pgTAP").
- **Ordering determinism:** voices entries sort with a plain lexicographic compare `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` — never `localeCompare`.
- **Deadline operator:** `isExemptMember` mirrors the SQL's STRICT `now() > assessment_deadline_at` (`20260801000400:39`) — at the boundary instant the window is still open.
- **Gates (run at every task's commit point where stated, and all four in Task 24):** `npx tsc --noEmit` → 0 errors; `npm run lint` → 0; `npm run test` → green (706 existing + new); `npm run build` → clean.
- **Existing-file conventions win:** snippets below were drafted against verified structure. If a file's real local names, import specifiers, or error-literal shapes differ from a snippet's surroundings, keep the file's conventions and apply the stated delta. Never change semantics to match a snippet cosmetically.
- **Migration numbering:** last applied series is `20260801000800`; this feature uses `20260807000100`–`20260807000600`. pgTAP: last is `23_assessment_deadlines_test.sql`; this feature adds `24_outreach_reflection_test.sql`.

## Owner TODO (Natalie — after merge; the agent never runs these)

1. Apply migrations `20260807000100` → `20260807000600` in order (then `npm run test:db` to run pgTAP 24).
2. Sequencing note: deploy the app together with (or after) the migrations. In the window where the new code is live but `20260807000600` isn't applied, the shared page's rows lack `methodology_version` → derive treats those runs as pre-0.3.0. For old runs that's correct; a brand-new 0.3.0 shared run would transiently render filtered. Applying migrations first avoids this entirely.

## File Structure

**New source files**
- `lib/methodology/effective.ts` — version predicate + effective-methodology filter (Deviation 1's core).
- `lib/coverage/exemption.ts` — `isExemptMember` (dashboard-only exemption).
- `supabase/migrations/20260807000100_responses_reflection_column.sql` … `20260807000600_rpc_get_shared_run_responses_methodology_version.sql` — six migrations (below).
- `supabase/tests/24_outreach_reflection_test.sql` — owner-run pgTAP.

**Modified source files**
- `lib/methodology/schema.ts` (ItemSchema + `since`/`reflection`), `methodology/questions.yaml` (0.3.0 + 10 items).
- `lib/answers/validate.ts`, `components/answer-form.tsx`, `app/app/[churchId]/answer/[categoryId]/self-form.tsx`, `app/app/[churchId]/answer/[categoryId]/page.tsx` — reflection capture path.
- `lib/report/derive.ts` + its four call sites: `app/app/[churchId]/actions.ts` (`generateDiagnosis`), `app/app/[churchId]/diagnosis/page.tsx`, `app/api/report/[runId]/pdf/route.ts`, `app/r/[shareToken]/page.tsx`.
- `lib/report/view.ts`, `app/app/[churchId]/diagnosis/report/dossier.tsx`, `lib/report/pdf/document.tsx` — voices rendering.
- `lib/coverage/member-matrix.ts`, `app/app/[churchId]/page.tsx` — exemption plumbing.
- `components/anonymity-note.tsx` — reflection sentence (full variant only).

**Test files** — new: `tests/methodology/effective.test.ts`, `tests/methodology/questions-yaml-outreach.test.ts`, `tests/answers/validate-reflection.test.ts`, `tests/assessment/answer-form-reflection.test.ts`, `tests/coverage/exemption.test.ts`, `tests/report/pdf-voices.test.ts`, and `tests/outreach/` (migration tripwires ×5 files, `shared-exclusion.test.ts`, `ai-exclusion.test.ts`, `dashboard-exemption-wiring.test.ts`). Extended: `tests/methodology/schema.test.ts`, `tests/report/derive.test.ts`, `tests/report/view.test.ts`, `tests/report/components.test.ts`, `tests/coverage/member-matrix.test.ts` (+ 3 sibling matrix-fixture files), `tests/assessment/answer-anonymity-note.test.ts`, `tests/access/accept-anonymity-note.test.ts`.

---

### Task 1: zod — `since` + `reflection` on `ItemSchema`

**Files:**
- Modify: `lib/methodology/schema.ts:12-17` (ItemSchema)
- Test: `tests/methodology/schema.test.ts` (append cases)

**Interfaces:**
- Consumes: existing `ItemSchema` `{ id, text, signal, anchors }`, existing `cat()` helper + `eightCategories` fixture in the test file.
- Produces: `Item` type (z.infer) gains optional `since?: string` and `reflection?: string` — every later task that touches items relies on these exact optional fields.

- [ ] **Step 1: Write the failing tests** — append to `tests/methodology/schema.test.ts`, inside its existing top-level describe, using its local `cat()` helper exactly as neighboring cases do:

```ts
it('accepts items carrying since and reflection', () => {
  const c = cat();
  c.items[0] = { ...c.items[0], since: '0.3.0', reflection: 'Tell us.' };
  const parsed = CategorySchema.safeParse(c);
  expect(parsed.success).toBe(true);
});

it('rejects an empty-string since', () => {
  const c = cat();
  c.items[0] = { ...c.items[0], since: '' };
  expect(CategorySchema.safeParse(c).success).toBe(false);
});

it('rejects an empty-string reflection', () => {
  const c = cat();
  c.items[0] = { ...c.items[0], reflection: '' };
  expect(CategorySchema.safeParse(c).success).toBe(false);
});
```

(If `cat()` returns a readonly/typed shape that rejects the spread, build the item object inline the way the file's other negative cases do — keep the three assertions identical.)

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run tests/methodology/schema.test.ts`
Expected: the two `rejects empty-string` cases FAIL (unknown keys are stripped or accepted today — `safeParse(...).success` comes back `true`).

- [ ] **Step 3: Implement** — in `lib/methodology/schema.ts`, add two optional fields to `ItemSchema`. Key order does not affect zod validation, but mirror the yaml's field order for readability: `since` goes after `signal`, `reflection` after `anchors`.

```ts
  since: z.string().min(1).optional(),
```

```ts
  reflection: z.string().min(1).optional(),
```

`.min(1)` is what makes the two empty-string cases in Step 1 fail today and pass after — an item either omits the field or carries real text.

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run tests/methodology/schema.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/methodology/schema.ts tests/methodology/schema.test.ts
git commit -m "feat: ItemSchema gains optional since + reflection fields"
```

### Task 2: `lib/methodology/effective.ts`

**Files:**
- Create: `lib/methodology/effective.ts`
- Test: `tests/methodology/effective.test.ts` (new)

**Interfaces:**
- Consumes: `Methodology` type from `lib/methodology/schema` (interface `{ questions, rules, benchmarks, offers, copy }`); Task 1's `Item.since`.
- Produces: `OUTREACH_VERSION = '0.3.0'`, `PRE_OUTREACH_VERSION = '0.2.0'`, `predatesOutreach(version: string | null): boolean`, `effectiveMethodologyForRun(methodology: Methodology, runVersion: string | null): Methodology`. Tasks 13, 19, 21 import these exact names.

- [ ] **Step 1: Write the failing test** — create `tests/methodology/effective.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Methodology } from '@/lib/methodology/schema';
import {
  OUTREACH_VERSION,
  PRE_OUTREACH_VERSION,
  effectiveMethodologyForRun,
  predatesOutreach,
} from '@/lib/methodology/effective';

function fixtureMethodology(): Methodology {
  return {
    questions: {
      version: '0.3.0',
      categories: [
        {
          id: 'guest',
          name: 'Guest Experience',
          items: [
            { id: 'G1', text: 'Old question', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
            {
              id: 'G6',
              text: 'New question',
              signal: 'evidence',
              since: '0.3.0',
              anchors: { lo: 'l', mid: 'm', hi: 'h' },
              reflection: 'Tell us.',
            },
          ],
        },
      ],
    },
  } as unknown as Methodology;
}

describe('predatesOutreach', () => {
  it('null predates (pre-stamping runs)', () => {
    expect(predatesOutreach(null)).toBe(true);
  });
  it.each(['0.1.0', '0.2.0'])('%s predates', (v) => {
    expect(predatesOutreach(v)).toBe(true);
  });
  it('0.3.0 does not predate', () => {
    expect(predatesOutreach('0.3.0')).toBe(false);
  });
  it('constants are pinned', () => {
    expect(OUTREACH_VERSION).toBe('0.3.0');
    expect(PRE_OUTREACH_VERSION).toBe('0.2.0');
  });
});

describe('effectiveMethodologyForRun', () => {
  it('non-predating run gets the SAME reference back', () => {
    const m = fixtureMethodology();
    expect(effectiveMethodologyForRun(m, '0.3.0')).toBe(m);
  });
  it.each([null, '0.1.0', '0.2.0'])('predating run (%s) gets a filtered copy stamped 0.2.0', (v) => {
    const m = fixtureMethodology();
    const eff = effectiveMethodologyForRun(m, v as string | null);
    expect(eff).not.toBe(m);
    expect(eff.questions.version).toBe('0.2.0');
    expect(eff.questions.categories[0].items.map((i) => i.id)).toEqual(['G1']);
  });
  it('keeps categories intact (filter drops items, never categories)', () => {
    const m = fixtureMethodology();
    const eff = effectiveMethodologyForRun(m, '0.2.0');
    expect(eff.questions.categories).toHaveLength(m.questions.categories.length);
    expect(eff.questions.categories[0].id).toBe('guest');
  });
  it('does not mutate the input', () => {
    const m = fixtureMethodology();
    effectiveMethodologyForRun(m, '0.2.0');
    expect(m.questions.categories[0].items).toHaveLength(2);
    expect(m.questions.version).toBe('0.3.0');
  });
});
```

(If the repo's tests import source via relative paths instead of `@/`, mirror the import style used by `tests/methodology/schema.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/effective.test.ts`
Expected: FAIL — module `lib/methodology/effective` does not exist.

- [ ] **Step 3: Implement** — create `lib/methodology/effective.ts`:

```ts
import type { Methodology } from './schema';

export const OUTREACH_VERSION = '0.3.0';
export const PRE_OUTREACH_VERSION = '0.2.0';

/**
 * null (pre-stamping runs) predates; otherwise a plain string compare —
 * the spec's §Migration sanctions lexicographic compare for these version values.
 */
export function predatesOutreach(version: string | null): boolean {
  if (version === null) return true;
  return version < OUTREACH_VERSION;
}

/**
 * Non-predating runs get the SAME reference back (identity matters: derive tests
 * assert reference equality, and responseHash/save_diagnosis see identical input).
 * Predating runs get a deep-filtered copy — keep an item iff it has no `since`,
 * or the run's version is >= it — stamped PRE_OUTREACH_VERSION ('0.2.0' names the
 * test edition, not the run's birthday). The filter drops items, never categories.
 */
export function effectiveMethodologyForRun(
  methodology: Methodology,
  runVersion: string | null,
): Methodology {
  if (!predatesOutreach(runVersion)) return methodology;
  return {
    ...methodology,
    questions: {
      ...methodology.questions,
      version: PRE_OUTREACH_VERSION,
      categories: methodology.questions.categories.map((c) => ({
        ...c,
        items: c.items.filter((i) => i.since == null || (runVersion !== null && runVersion >= i.since)),
      })),
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/methodology/effective.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/methodology/effective.ts tests/methodology/effective.test.ts
git commit -m "feat: effectiveMethodologyForRun — version-filtered methodology (candidate 4)"
```

### Task 3: `questions.yaml` → 0.3.0 + the 10 outreach items

**Files:**
- Modify: `methodology/questions.yaml` (line 1 version bump; append 1–2 items to each category's `items:` list)
- Test: `tests/methodology/questions-yaml-outreach.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `since`/`reflection` schema fields (the loader parses this yaml through `ItemSchema`).
- Produces: methodology 0.3.0 on disk — ids `G6 G7 C6 D6 V6 GEN6 GOV6 COM6 COM7 SYS6`, each with `since: "0.3.0"` + a `reflection` prompt. Guest Experience + Communication end with 7 items; the other six categories with 6.

- [ ] **Step 1: Write the failing test** — create `tests/methodology/questions-yaml-outreach.test.ts`. Source-read style (readFileSync, no loader import — this pins the file itself):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync('methodology/questions.yaml', 'utf8');

const CATEGORIES = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

const PLACEMENT: Array<[string, string]> = [
  ['G6', 'guest'],
  ['G7', 'guest'],
  ['C6', 'conn'],
  ['D6', 'disc'],
  ['V6', 'vol'],
  ['GEN6', 'gen'],
  ['GOV6', 'gov'],
  ['COM6', 'comm'],
  ['COM7', 'comm'],
  ['SYS6', 'sys'],
];

// Category headers sit at 2-space indent (`  - id: guest`), items at 6
// (`      - id: G6`) — the indents keep the two namespaces distinct.
function categorySlice(categoryId: string): string {
  const start = yaml.indexOf(`  - id: ${categoryId}\n`);
  const nextId = CATEGORIES[CATEGORIES.indexOf(categoryId) + 1];
  const end = nextId ? yaml.indexOf(`  - id: ${nextId}\n`) : yaml.length;
  return yaml.slice(start, end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('questions.yaml 0.3.0 outreach items', () => {
  it('line 1 pins the version', () => {
    expect(yaml.split('\n')[0]).toBe('version: "0.3.0"');
  });

  it('every category header resolves', () => {
    for (const c of CATEGORIES) {
      expect(yaml.indexOf(`  - id: ${c}\n`), c).toBeGreaterThan(-1);
    }
  });

  it.each(PLACEMENT)('%s appears exactly once, inside %s', (itemId, categoryId) => {
    expect(count(yaml, `      - id: ${itemId}\n`)).toBe(1);
    expect(count(categorySlice(categoryId), `      - id: ${itemId}\n`)).toBe(1);
  });

  it('all 10 carry since 0.3.0 and a reflection prompt', () => {
    expect(count(yaml, 'since: "0.3.0"')).toBe(10);
    expect(count(yaml, 'reflection:')).toBe(10);
  });

  it('new items are appended at the END of their category', () => {
    const guest = categorySlice('guest');
    expect(guest.indexOf('- id: G5')).toBeLessThan(guest.indexOf('- id: G6'));
    expect(guest.indexOf('- id: G6')).toBeLessThan(guest.indexOf('- id: G7'));
    const comm = categorySlice('comm');
    expect(comm.indexOf('- id: COM5')).toBeLessThan(comm.indexOf('- id: COM6'));
    expect(comm.indexOf('- id: COM6')).toBeLessThan(comm.indexOf('- id: COM7'));
  });

  it('item counts: guest/comm 7, others 6', () => {
    const expected: Record<string, number> = {
      guest: 7, conn: 6, disc: 6, vol: 6, gen: 6, gov: 6, comm: 7, sys: 6,
    };
    for (const c of CATEGORIES) {
      expect(count(categorySlice(c), '      - id: '), c).toBe(expected[c]);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/questions-yaml-outreach.test.ts`
Expected: FAIL — version line still `"0.2.0"`, new ids absent, counts 5.

- [ ] **Step 3: Edit `methodology/questions.yaml`** — two kinds of edit, nothing else changes:

1. Line 1: `version: "0.2.0"` → `version: "0.3.0"`.
2. Append the blocks below at the **end of each named category's `items:` list** — i.e. immediately BEFORE the next category's 2-space `  - id:` line (SYS6 goes at the very end of the file, after SYS5's last line). These are the spec's blocks (spec lines 24–134) verbatim, re-indented to the file's 6/8/10 convention, comment lines omitted. Field order stays `id, text, signal, since, anchors{lo,mid,hi}, reflection`.

**Append to `guest` (before `  - id: conn`):**

```yaml
      - id: G6
        text: "When your church meets people out in the community — a serve day, an event — does anything connect them to a Sunday?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "No. Community moments stay out there; we hope people show up on their own."
          mid: "We invite people personally, but there's no consistent bridge from an encounter to a visit."
          hi: "There's a deliberate bridge — invitations, info we capture, follow-up — and we can name guests who came through it."
        reflection: "Tell about one person who first met your church outside its walls. What happened next?"
      - id: G7
        text: "When did you last hear of someone showing up because one of your people invited them?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "I can't remember one. Inviting isn't part of our culture."
          mid: "It happens now and then; a few natural inviters carry it."
          hi: "Regularly — invitation stories are normal here, and we hear new ones monthly."
        reflection: "Tell the most recent invitation story you know — who invited whom, and what happened?"
```

**Append to `conn` (before `  - id: disc`):**

```yaml
      - id: C6
        text: "Could someone far from church find real belonging here before they believe?"
        signal: belief
        since: "0.3.0"
        anchors:
          lo: "Honestly, no. Our community life assumes you're already one of us."
          mid: "They'd be welcomed warmly, but our groups and rhythms aren't built with outsiders in mind."
          hi: "Yes — neighbors and skeptics are inside our community life right now, belonging on the way to believing."
        reflection: "Where does your church currently make room for people who don't yet believe? Name a place or group."
```

**Append to `disc` (before `  - id: vol`):**

```yaml
      - id: D6
        text: "Does your discipleship send people outward — into neighborhoods, schools, and workplaces — or mainly deeper into church life?"
        signal: belief
        since: "0.3.0"
        anchors:
          lo: "Inward. Growth here mostly means more involvement at church."
          mid: "We talk about being sent, but we don't equip people for it or ask about it."
          hi: "Being formed here means being sent — our people carry faith into their week, and we equip them for it."
        reflection: "Describe one way someone discipled here carried it into their neighborhood, school, or workplace."
```

**Append to `vol` (before `  - id: gen`):**

```yaml
      - id: V6
        text: "How much of the serving here happens beyond Sunday — out in the community?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "Almost none. Serving means running our own services and programs."
          mid: "A few serve projects a year, driven by bursts of enthusiasm."
          hi: "Serving the community is a standing part of our volunteer culture, with teams that exist for it."
        reflection: "What's one way your volunteers served the community recently? Who showed up?"
```

**Append to `gen` (before `  - id: gov`):**

```yaml
      - id: GEN6
        text: "Does your church's money visibly reach your community — benevolence, local partners, real needs met?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "Rarely. Nearly everything we collect stays inside our own operations."
          mid: "We give some, reactively, when needs find us."
          hi: "A deliberate share of our budget serves the community, and we could name the partners and needs it funds."
        reflection: "Name one need in your community your church's generosity met this year."
```

**Append to `gov` (before `  - id: comm`):**

```yaml
      - id: GOV6
        text: "Is your community's good anyone's actual responsibility at the leadership level?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "No. Outreach happens if someone's passionate; leadership doesn't own it."
          mid: "Leadership values it and blesses efforts, but no one owns it and it's rarely on the agenda."
          hi: "Someone owns community engagement, and it shows up in our planning and decisions."
        reflection: "Who, if anyone, owns your church's presence in the community? How did that come to be?"
```

**Append to `comm` (before `  - id: sys`):**

```yaml
      - id: COM6
        text: "If you asked ten neighbors near your building what your church contributes to the community, what would they say?"
        signal: belief
        since: "0.3.0"
        anchors:
          lo: "Most wouldn't know we exist, or would just say 'it's a church.'"
          mid: "Some would recognize us and mention an event or two."
          hi: "Most could name something specific we do for this community — our reputation runs ahead of us."
        reflection: "What do you think your community would say your church is known for? Be honest."
      - id: COM7
        text: "Do you actually know your community's current needs, or assume them?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "We assume. Our outreach reflects what we like to do."
          mid: "We know some needs through relationships, but we've never really asked."
          hi: "We've listened deliberately — asked neighbors, schools, or partners — and it shapes what we do."
        reflection: "How did your church last learn something new about what your community needs?"
```

**Append to `sys` (end of file, after SYS5's last line):**

```yaml
      - id: SYS6
        text: "Do your community efforts run on systems — owned partnerships, follow-up, a rhythm — or on bursts of enthusiasm?"
        signal: evidence
        since: "0.3.0"
        anchors:
          lo: "Enthusiasm. Outreach is one-off events that depend on whoever's excited."
          mid: "Some recurring efforts, but partnerships and follow-up live in people's heads."
          hi: "Outreach runs on a rhythm — named partners, owned relationships, and follow-up that doesn't depend on any one person."
        reflection: "List the community partnerships your church has right now. Who owns each one?"
```

- [ ] **Step 4: Run to verify it passes — then run the full suite**

Run: `npx vitest run tests/methodology/questions-yaml-outreach.test.ts` → PASS.
Run: `npm run test` → green. (Task 1's schema accepts the new fields; plan-time inventory found no existing test pinning yaml item counts or `"0.2.0"`. If one fails anyway, fix that test's expectation — never the yaml.)

- [ ] **Step 5: Commit**

```bash
git add methodology/questions.yaml tests/methodology/questions-yaml-outreach.test.ts
git commit -m "feat: methodology 0.3.0 — ten outreach items with since + reflection"
```

## About Tasks 4–9 (SQL)

**The agent writes these files and never executes them.** No `supabase db push`, no `supabase db reset`, no `npm run test:db`. Verification for each is a vitest **tripwire**: a source-read test that opens the `.sql` file and asserts its text. That is the whole test cycle for a migration task — a green tripwire means "the migration says what it must say", not "the migration ran".

For the five RPC migrations the instruction is always the same shape: **copy the named source migration's body byte-identically into the new file, then apply exactly the stated insertions.** Do not retype the body from memory, do not reformat, do not "improve" anything you copy. Tripwires are modeled on `tests/deadlines/migration-submit-lock.test.ts` (readFileSync + `toContain` + `indexOf` ordering).

### Task 4: Migration `20260807000100` — `responses.reflection` column

**Files:**
- Create: `supabase/migrations/20260807000100_responses_reflection_column.sql`
- Test: `tests/outreach/migration-reflection-column.test.ts` (new; creates the `tests/outreach/` directory)

**Interfaces:**
- Consumes: nothing.
- Produces: `public.responses.reflection text` with an inline CHECK — null, or 1..2000 characters. Tasks 5–8's RPCs read/write this column; Task 9's pgTAP asserts its bounds.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/migration-reflection-column.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000100_responses_reflection_column.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000100 responses.reflection column', () => {
  it('adds the column to public.responses', () => {
    expect(body).toContain('alter table public.responses');
    expect(body).toContain('add column reflection text');
  });

  it('constrains length to 1..2000, null allowed', () => {
    expect(body).toContain('reflection is null');
    expect(body).toContain('char_length(reflection) between 1 and 2000');
  });

  it('does not drop or rewrite the table', () => {
    expect(body).not.toContain('drop table');
    expect(body).not.toContain('drop column');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/migration-reflection-column.test.ts`
Expected: FAIL — `ENOENT`, the migration file does not exist.

- [ ] **Step 3: Create the migration** — `supabase/migrations/20260807000100_responses_reflection_column.sql`, exactly:

```sql
-- Outreach questions (methodology 0.3.0): optional free-text reflection per response.
-- Nullable — every existing row keeps NULL, and reflections stay optional forever.
-- The CHECK mirrors the app-layer limit (lib/answers/validate.ts) and the RPC guard
-- in 20260807000200: empty/whitespace-only text is normalised to NULL before it lands,
-- so a stored reflection is always 1..2000 real characters.

alter table public.responses
  add column reflection text
  check (reflection is null or char_length(reflection) between 1 and 2000);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/outreach/migration-reflection-column.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000100_responses_reflection_column.sql tests/outreach/migration-reflection-column.test.ts
git commit -m "feat(db): add responses.reflection column (1..2000 chars, nullable)"
```

### Task 5: Migration `20260807000200` — `submit_self_response` carries reflection

**Files:**
- Create: `supabase/migrations/20260807000200_rpc_submit_self_response_reflection.sql`
- Source to copy: `supabase/migrations/20260801000400_rpc_submit_self_response_deadline_lock.sql` (69 lines)
- Test: `tests/outreach/migration-submit-reflection.test.ts` (new)

**Interfaces:**
- Consumes: Task 4's `responses.reflection` column.
- Produces: `public.submit_self_response(uuid, text, jsonb)` — **unchanged signature** — where each element of `p_answers` may carry an optional `reflection` key: `{item_id, value, reflection?}`. Tasks 10–12 (validate + form) produce that payload shape.

Deviation 2 lives here. The signature does not change, so this is a plain `create or replace function` — no drop.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/migration-submit-reflection.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000200_rpc_submit_self_response_reflection.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000200 submit_self_response reflection', () => {
  it('replaces the function in place (same signature, no drop)', () => {
    expect(body).toContain('create or replace function public.submit_self_response');
    expect(body).not.toContain('drop function');
  });

  it('rejects reflections longer than 2000 characters', () => {
    expect(body).toContain("char_length(btrim(a->>'reflection')) > 2000");
    expect(body).toContain('raise exception');
  });

  it('normalises empty reflections to NULL on insert', () => {
    expect(body).toContain("nullif(btrim(a->>'reflection'), '')");
  });

  it('overwrites reflection alongside value on re-answer', () => {
    expect(body).toContain('reflection = excluded.reflection');
    expect(body).toContain('value = excluded.value');
  });

  it('keeps the deadline lock and the in_progress gate', () => {
    expect(body).toContain('assessment_deadline_at');
    expect(body).toContain('in_progress');
  });

  it('length guard runs before the insert', () => {
    expect(body.indexOf("char_length(btrim(a->>'reflection'))")).toBeLessThan(
      body.indexOf('insert into public.responses'),
    );
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
    expect(body).toContain('to authenticated');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/migration-submit-reflection.test.ts`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Create the migration.** Copy `20260801000400_rpc_submit_self_response_deadline_lock.sql` **byte-for-byte** into the new file, then make exactly these four edits. Everything else — the payload-shape guard, auth check, membership check, deadline-lock block, `current_run` + `'in_progress'` gate, the `coalesce(full_name, email, 'Member')` label — stays character-identical.

Replace the file's leading comment with this one:

```sql
-- Outreach questions (methodology 0.3.0): carry an optional per-answer reflection.
--
-- DEVIATION FROM THE SPEC'S LETTER (approved, see the plan's Deviation 2): the spec
-- sketched a trailing `p_reflection text` argument, which cannot carry two reflections
-- in one whole-category submit (Guest Experience has G6+G7, Communication COM6+COM7).
-- Instead each element of p_answers may carry an optional `reflection` key:
--   { "item_id": "G6", "value": 7, "reflection": "..." }
-- The argument signature is unchanged (uuid, text, jsonb), so this is a plain
-- CREATE OR REPLACE. Absent key => NULL. Empty/whitespace-only => NULL, which means a
-- re-answer with the textarea cleared clears the stored text (value and reflection
-- always travel together).
```

**Edit 1 — length guard.** Immediately after the existing payload-shape guard block (the one rejecting a non-array / out-of-range `p_answers`, before the auth check), insert:

```sql
  if exists (
    select 1
    from jsonb_array_elements(p_answers) as a
    where char_length(btrim(a->>'reflection')) > 2000
  ) then
    raise exception 'reflection too long (max 2000 characters)';
  end if;
```

**Edit 2 — insert column list.** Append `reflection` to the insert's column list, so it reads:

```sql
  insert into public.responses (
    run_id, church_id, category_id, item_id, value,
    respondent_kind, respondent_user_id, respondent_label, reflection
  )
```

**Edit 3 — insert select list.** Append the matching expression as the final selected column (keep every existing expression exactly as copied):

```sql
    nullif(btrim(a->>'reflection'), '')
```

**Edit 4 — conflict update.** Extend the existing `do update set` clause with the reflection assignment:

```sql
  do update set
    value = excluded.value,
    category_id = excluded.category_id,
    reflection = excluded.reflection;
```

Keep the trailing `revoke all ... from public, anon;` / `grant execute ... to authenticated;` lines exactly as copied (re-issuing them after `create or replace` is this repo's convention).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/outreach/migration-submit-reflection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000200_rpc_submit_self_response_reflection.sql tests/outreach/migration-submit-reflection.test.ts
git commit -m "feat(db): submit_self_response accepts an optional per-answer reflection"
```

### Task 6: Migration `20260807000300` — `get_my_category_answers` returns reflection

**Files:**
- Create: `supabase/migrations/20260807000300_rpc_get_my_category_answers_reflection.sql`
- Source to copy: `supabase/migrations/20260730000100_fn_current_run_dedup_resolution.sql:269-304` (the `get_my_category_answers` definition only)
- Test: `tests/outreach/migration-my-category-answers.test.ts` (new)

**Interfaces:**
- Consumes: Task 4's column.
- Produces: `get_my_category_answers(uuid, text)` returning `(item_id text, value int, reflection text)`. Task 12's answer page casts rows to that shape to prefill the textarea.

Postgres cannot change a function's return type in place (error 42P13), so this is a DROP + recreate — the same precedent `20260728000100`'s header documents.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/migration-my-category-answers.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000300_rpc_get_my_category_answers_reflection.sql',
  'utf8',
);
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000300 get_my_category_answers reflection', () => {
  it('drops before recreating (42P13: return type cannot change in place)', () => {
    expect(body).toContain('drop function if exists public.get_my_category_answers(uuid, text)');
    expect(body).toContain('create function public.get_my_category_answers');
    expect(body.indexOf('drop function')).toBeLessThan(body.indexOf('create function'));
  });

  it('returns reflection alongside item_id and value', () => {
    expect(body).toContain('item_id text');
    expect(body).toContain('value int');
    expect(body).toContain('reflection text');
    expect(body).toContain('r.reflection');
  });

  it('keeps the caller scoping (own member responses, this category)', () => {
    expect(body).toContain("respondent_kind = 'member'");
    expect(body).toContain('respondent_user_id');
    expect(body).toContain('category_id = p_category_id');
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
    expect(body).toContain('to authenticated');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/migration-my-category-answers.test.ts`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Create the migration.** Open `20260730000100_fn_current_run_dedup_resolution.sql`, copy the `get_my_category_answers` definition (lines 269–304) **byte-for-byte** into the new file, then:

Lead the file with a header in the style of `20260728000100`'s (which documents the same 42P13 constraint):

```sql
-- Outreach questions (methodology 0.3.0): get_my_category_answers also returns the
-- caller's own reflection text, so the answer form can prefill the textarea the same
-- way it prefills the rating.
--
-- DROP + recreate rather than CREATE OR REPLACE: Postgres refuses to change a
-- function's return type in place (42P13). Same pattern as 20260728000100.

drop function if exists public.get_my_category_answers(uuid, text);
```

Then the copied definition with exactly two changes:
- the `returns table (...)` list gains a third column — `reflection text` — after `value int`;
- the select list gains `r.reflection` as its third selected expression, matching the copied alias (if the copied body aliases the table something other than `r`, use that alias).

The body's auth check, membership check, `current_run` resolution, and `where` clause stay character-identical. Keep the trailing `revoke`/`grant` lines as copied.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/outreach/migration-my-category-answers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000300_rpc_get_my_category_answers_reflection.sql tests/outreach/migration-my-category-answers.test.ts
git commit -m "feat(db): get_my_category_answers returns the caller's reflection"
```

### Task 7: Migrations `20260807000400` + `000500` — run-response RPCs return reflection

**Files:**
- Create: `supabase/migrations/20260807000400_rpc_get_run_responses_reflection.sql`
- Create: `supabase/migrations/20260807000500_rpc_get_completed_run_responses_reflection.sql`
- Sources to copy: `20260728000100_rpc_get_run_responses_add_user_id.sql` (63 lines) and `20260728000300_*` (52 lines) respectively — byte-siblings differing only in run status scope
- Test: `tests/outreach/migration-run-responses.test.ts` (new — covers both files)

**Interfaces:**
- Consumes: Task 4's column.
- Produces: both RPCs return a 6th column `reflection text`. Task 16 (screen) and Task 17 (PDF) read it into the `reflections` array they hand to the report view.

These two migrations are a single task because they are the same edit twice on byte-sibling sources, and neither is independently rejectable.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/migration-run-responses.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES: Array<[string, string, string]> = [
  ['get_run_responses', '20260807000400_rpc_get_run_responses_reflection.sql', 'in_progress'],
  ['get_completed_run_responses', '20260807000500_rpc_get_completed_run_responses_reflection.sql', 'complete'],
];

describe.each(FILES)('%s reflection migration', (fn, file, status) => {
  const body = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/--[^\n]*$/gm, '');

  it('drops before recreating', () => {
    expect(body).toContain(`drop function if exists public.${fn}(uuid)`);
    expect(body).toContain(`create function public.${fn}`);
    expect(body.indexOf('drop function')).toBeLessThan(body.indexOf('create function'));
  });

  it('returns reflection as a sixth column', () => {
    expect(body).toContain('reflection text');
    expect(body).toContain('r.reflection');
  });

  it('keeps the five original columns', () => {
    for (const col of ['category_id', 'item_id', 'value', 'respondent_label', 'respondent_user_id']) {
      expect(body, col).toContain(col);
    }
  });

  it(`keeps its run scope (${status}) and inline run resolution`, () => {
    expect(body).toContain(status);
    expect(body).not.toContain('current_run()');
  });

  it('re-issues the grants', () => {
    expect(body).toContain('revoke all');
    expect(body).toContain('grant execute');
  });
});
```

(If the copied signatures take a different argument list than `(uuid)`, adjust the two `drop function if exists` expectations and the SQL to match the real signature — they must agree.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/migration-run-responses.test.ts`
Expected: FAIL — `ENOENT` for both files.

- [ ] **Step 3: Create both migrations.** For each: copy its source migration **byte-for-byte**, prepend the header below (adjusting the function name), add the `drop function if exists` line before the `create function`, and make the two column edits.

```sql
-- Outreach questions (methodology 0.3.0): <FN> also returns the response's
-- reflection text, which the report view groups into "Voices on outreach".
--
-- DROP + recreate rather than CREATE OR REPLACE: the return type changes (42P13).
-- The run is still resolved INLINE here, deliberately — 20260730000100's header
-- defers converting these RPCs to current_run() to a follow-up under pgTAP.

drop function if exists public.<FN>(uuid);
```

Then, in the copied definition:
- the `returns table (...)` list gains a 6th column `reflection text` after `respondent_user_id`;
- the select list gains `r.reflection` as its 6th expression (match the copied alias).

Nothing else changes — including the inline oldest-first run select and each function's status scope (`'in_progress'` for `get_run_responses`, `'complete'` for `get_completed_run_responses`). Keep the trailing `revoke`/`grant` lines as copied.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/outreach/migration-run-responses.test.ts`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000400_rpc_get_run_responses_reflection.sql supabase/migrations/20260807000500_rpc_get_completed_run_responses_reflection.sql tests/outreach/migration-run-responses.test.ts
git commit -m "feat(db): run-response RPCs return reflection"
```

### Task 8: Migration `20260807000600` — shared RPC gains `methodology_version`, never reflection

**Files:**
- Create: `supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql`
- Source to copy: `supabase/migrations/20260728000400_*` (58 lines, `get_shared_run_responses`)
- Test: `tests/outreach/migration-shared-methodology-version.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Tasks 4–7 (deliberately — this is the exclusion boundary).
- Produces: `get_shared_run_responses` returns a 7th column `methodology_version text`, denormalized from `assessment_runs` exactly the way `attendance_band` is denormalized from `churches`. Task 18 (shared page) reads it to pass a run version into derive.

**Why this migration exists:** the anon share path has no other source for the run's version — `get_shared_report` returns only `(valid, payload, church_name, brand_color)` and stays untouched. Without the version, every shared report would be treated as pre-0.3.0.

**Why it must NOT return reflection:** the shared surface excludes reflections at three independent layers — SQL (this function), the TypeScript row type (Task 18), and the view builder's audience gate (Task 14). This test is the SQL layer's proof and asserts the absence.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/migration-shared-methodology-version.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql',
  'utf8',
);
// Strip line comments: the header explains WHY reflection is absent, and that
// explanation must not satisfy the absence assertion below.
const body = sql.replace(/--[^\n]*$/gm, '');

describe('20260807000600 get_shared_run_responses methodology_version', () => {
  it('drops before recreating', () => {
    expect(body).toContain('drop function if exists public.get_shared_run_responses');
    expect(body).toContain('create function public.get_shared_run_responses');
    expect(body.indexOf('drop function')).toBeLessThan(body.indexOf('create function'));
  });

  it('returns methodology_version, read from the share\'s run', () => {
    expect(body).toContain('methodology_version text');
    expect(body).toContain('v_run.methodology_version');
    expect(body).toContain('public.assessment_runs');
    expect(body).toContain('v_share.run_id');
  });

  it('NEVER exposes reflection on the shared surface', () => {
    expect(body).not.toContain('reflection');
  });

  it('keeps the token gate and the label redaction', () => {
    expect(body).toContain('revoked');
    expect(body).toContain('expires_at');
    expect(body).toContain("''::text as respondent_label");
  });

  it('keeps the anon + authenticated grants', () => {
    expect(body).toContain('grant execute');
    expect(body).toContain('anon');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/migration-shared-methodology-version.test.ts`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Create the migration.** Copy `20260728000400_*` **byte-for-byte**, prepend this header plus the drop, then make three edits:

```sql
-- Outreach questions (methodology 0.3.0): the shared (anon) report path needs the
-- run's methodology_version so it can score old runs against the old item list.
-- get_shared_report returns only (valid, payload, church_name, brand_color) and stays
-- untouched, so this RPC is the only place the version can travel. It is denormalized
-- from assessment_runs the same way attendance_band is denormalized from churches.
--
-- This function deliberately does NOT return reflection. Reflections never reach the
-- shared surface: excluded here in SQL, absent from SharedRunResponseRow in TypeScript,
-- and gated by audience !== 'shared' in the report view builder.
--
-- DROP + recreate rather than CREATE OR REPLACE: the return type changes (42P13).

drop function if exists public.get_shared_run_responses(text);
```

(If the copied signature's argument type differs from `text`, match it — in the SQL and in the tripwire.)

Edits to the copied definition:
1. **Declare** a run row alongside the existing `v_share` / `v_church` declarations:

```sql
  v_run public.assessment_runs;
```

2. **Load it** after the token gate passes (i.e. after the `if not found or v_share.revoked or ... then return; end if;` block, next to where `v_church` is loaded):

```sql
  select * into v_run from public.assessment_runs where id = v_share.run_id;
```

3. **Return it**: the `returns table (...)` list gains a 7th column `methodology_version text` after `attendance_band`, and the select list gains `v_run.methodology_version` as its 7th expression.

Everything else — the token gate's early `return;`, the `''::text as respondent_label` redaction, the real `respondent_user_id`, the `v_church.attendance_band` denormalization, and the `revoke ... from public;` / `grant execute ... to anon, authenticated;` trailer — stays character-identical.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/outreach/migration-shared-methodology-version.test.ts`
Expected: PASS — including the negative `reflection` assertion.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql tests/outreach/migration-shared-methodology-version.test.ts
git commit -m "feat(db): shared run responses carry methodology_version (never reflection)"
```

### Task 9: pgTAP `24_outreach_reflection_test.sql` (owner-run)

**Files:**
- Create: `supabase/tests/24_outreach_reflection_test.sql`
- No vitest test — this file *is* the test, and only Natalie executes it.

**Interfaces:**
- Consumes: Tasks 4–8's migrations.
- Produces: database-level proof of the reflection contract. Nothing depends on it in code.

**The agent does not run this.** Model it on `22_get_completed_and_shared_run_responses_test.sql`: `begin; select plan(N);` → seed `auth.users` with the fixed `d1111111-…`/`d2222222-…` uuids → `set local role authenticated;` + `set local request.jwt.claims` → `create_church_with_admin('Name', '#hex', '0.1.0')` → `reset role` for superuser seeding → assertions via `is()` / `isnt()` / `ok()` / `lives_ok()` / `throws_ok($$…$$, 'P0001', 'msg', 'label')` → `select * from finish(); rollback;`. Copy 22's seeding blocks rather than inventing new ones, and keep `select plan(N)` in sync with the number of assertions you actually write.

- [ ] **Step 1: Write the file** — header first, verbatim (22 carries the same disclaimer style):

```sql
-- 24_outreach_reflection_test.sql
--
-- OWNER-APPLIED. The agent never runs `npm run test:db`. This suite is written
-- against the structure of migrations 20260807000100–20260807000600 and 22_/23_'s
-- conventions; it has NOT been executed here. Natalie runs it after applying the
-- migrations in order.
--
-- Covers: the responses.reflection CHECK bounds; submit_self_response trimming,
-- nullifying and rejecting reflections, and clearing text on re-answer; the three
-- member-facing RPCs returning reflection; and the shared RPC returning
-- methodology_version while never exposing reflection.
```

Then the suite. Write assertions for each of these, in this order — one `select ...` per bullet, seeding as 22 does:

1. **Column bounds.** `lives_ok` inserting a response with `reflection` of length 1; `lives_ok` at length 2000; `throws_ok` at length 2001 (CHECK violation, sqlstate `23514`); `lives_ok` with `reflection` NULL.
2. **Submit trims and nullifies.** Call `submit_self_response(church, category, '[{"item_id":"G6","value":7,"reflection":"  spaced  "}]'::jsonb)` as the authenticated member; `is()` the stored reflection to `'spaced'`. Then submit `"reflection": "   "` and `is()` the stored reflection to `NULL`.
3. **Submit rejects over-length.** `throws_ok($$ select public.submit_self_response(…2001-char reflection…) $$, 'P0001', 'reflection too long (max 2000 characters)', 'submit rejects reflections over 2000 characters')`.
4. **Re-answer clears old text.** Submit `{"item_id":"G6","value":7,"reflection":"first"}`, then `{"item_id":"G6","value":4}` (no reflection key); `is()` the stored value to `4` and the stored reflection to `NULL` — value and reflection always travel together.
5. **Absent key on a fresh answer stores NULL.** Submit `{"item_id":"G7","value":5}`; `is()` reflection to `NULL`.
6. **`get_my_category_answers` returns it.** As the member, `is()` the reflection for the seeded item.
7. **`get_run_responses` / `get_completed_run_responses` return it.** Seed a complete run the way 22 does; `is()` the reflection column on both.
8. **`get_shared_run_responses` returns `methodology_version`.** Seed a `report_shares` row with 22's fixed `'dddddddd-…'` id; `is()` the returned `methodology_version` to the run's.
9. **`get_shared_run_responses` has no reflection column.** `throws_ok` on `select reflection from public.get_shared_run_responses('<token>')` with sqlstate `42703` (undefined column) — the structural proof that reflections cannot leak to the anon surface.
10. **Grants unchanged.** As `anon`, `throws_ok` with `42501` on the three member-facing RPCs; `lives_ok` on `get_shared_run_responses` with a valid token.

- [ ] **Step 2: Verify structurally (the agent's only check)**

Run: `git diff --stat supabase/tests/24_outreach_reflection_test.sql`
Confirm by reading: the `select plan(N)` count equals the number of assertions written; the file opens with `begin;` and closes with `select * from finish();` + `rollback;`; every uuid literal matches 22's fixed ids.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/24_outreach_reflection_test.sql
git commit -m "test(db): pgTAP 24 — reflection storage, RPC contract, shared exclusion"
```

### Task 10: `lib/answers/validate.ts` — reflection passthrough

**Files:**
- Modify: `lib/answers/validate.ts` (`AnswerInput` :3-6; `validateCategoryAnswers` clean-push :47; `validateSingleAnswer` return :88)
- Test: `tests/answers/validate-reflection.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AnswerInput { item_id: string; value: number; reflection?: string }`. Task 11's form builds this; Task 5's SQL consumes it. Both validators reject a non-string reflection and one longer than 2000 characters after trimming, and otherwise **carry the value through as-is** — the server trims and nullifies.

- [ ] **Step 1: Write the failing test** — create `tests/answers/validate-reflection.test.ts`. Build the `categories` fixture the way `lib/answers/validate.ts`'s existing tests do (mirror the neighboring test file's `cat()`-shaped fixture and import style):

```ts
import { describe, expect, it } from 'vitest';
import { validateCategoryAnswers, validateSingleAnswer } from '@/lib/answers/validate';
import type { Category } from '@/lib/methodology/schema';

const categories: Category[] = [
  {
    id: 'guest',
    name: 'Guest Experience',
    items: [
      { id: 'G1', text: 'q1', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
      { id: 'G6', text: 'q6', signal: 'evidence', since: '0.3.0', anchors: { lo: 'l', mid: 'm', hi: 'h' }, reflection: 'Tell us.' },
    ],
  } as unknown as Category,
];

describe('validateSingleAnswer reflection', () => {
  it('carries a reflection through untrimmed', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '  hi  ' }, categories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answer.reflection).toBe('  hi  ');
  });

  it('omits reflection when absent', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G1', value: 3 }, categories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answer.reflection).toBeUndefined();
  });

  it('accepts an empty string (the server nullifies it)', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '' }, categories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answer.reflection).toBe('');
  });

  it('rejects a non-string reflection', () => {
    expect(validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: 42 }, categories).ok).toBe(false);
  });

  it('rejects a reflection longer than 2000 characters after trimming', () => {
    const long = `  ${'x'.repeat(2001)}  `;
    expect(validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: long }, categories).ok).toBe(false);
  });

  it('accepts exactly 2000 characters', () => {
    const at = 'x'.repeat(2000);
    expect(validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: at }, categories).ok).toBe(true);
  });
});

describe('validateCategoryAnswers reflection', () => {
  const all = [
    { item_id: 'G1', value: 3 },
    { item_id: 'G6', value: 7, reflection: 'hello' },
  ];

  it('carries reflections through on the whole-category path', () => {
    const r = validateCategoryAnswers('guest', all, categories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.find((a) => a.item_id === 'G6')?.reflection).toBe('hello');
  });

  it('rejects an over-long reflection anywhere in the batch', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 'x'.repeat(2001) }];
    expect(validateCategoryAnswers('guest', bad, categories).ok).toBe(false);
  });
});
```

(`validateCategoryAnswers`' success shape is the file's existing one — if its clean list is named something other than `answers`, use the real name in the two assertions above.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/answers/validate-reflection.test.ts`
Expected: FAIL — reflection is stripped (`undefined`) and the over-long cases pass validation.

- [ ] **Step 3: Implement** — three edits in `lib/answers/validate.ts`:

1. `AnswerInput` gains the optional field:

```ts
export interface AnswerInput {
  item_id: string;
  value: number;
  reflection?: string;
}
```

2. In **both** validators, after the existing per-answer checks (item membership, integer 1..10) and before the value is pushed/returned, validate and capture the reflection. Use the file's own error-reporting convention — same helper, same phrasing shape as its neighbors:

```ts
const rawReflection = (a as { reflection?: unknown }).reflection;
if (rawReflection !== undefined) {
  if (typeof rawReflection !== 'string') {
    return /* the file's error result */ 'Reflection must be text.';
  }
  if (rawReflection.trim().length > 2000) {
    return /* the file's error result */ 'Reflection is too long (max 2000 characters).';
  }
}
```

3. Build the clean answer with the reflection **only when present**, so absent stays absent (never an `undefined`-valued key):

```ts
clean.push({ item_id, value, ...(rawReflection !== undefined ? { reflection: rawReflection as string } : {}) });
```

Do the same in `validateSingleAnswer`'s `{ ok: true, answer: { item_id, value } }` return. Carry the string **as-is** — no trimming here; the SQL's `nullif(btrim(...), '')` owns normalization, and the length check trims only to measure.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/answers/` then `npm run test`
Expected: PASS — new file green, existing answer tests unaffected (the field is optional).

- [ ] **Step 5: Commit**

```bash
git add lib/answers/validate.ts tests/answers/validate-reflection.test.ts
git commit -m "feat: answer validators carry an optional reflection"
```

### Task 11: `components/answer-form.tsx` — the reflection textarea

**Files:**
- Modify: `components/answer-form.tsx` (`AnswerFormItem` :9-13; props; state :30-34; `saveCurrent` :53-75; JSX after the bands `</ul>` :174)
- Test: `tests/assessment/answer-form-reflection.test.ts` (new)

**Interfaces:**
- Consumes: Task 10's `AnswerInput.reflection`.
- Produces: `AnswerFormItem { id, text, anchors, reflection?: string }` and a new **optional** prop `initialReflections?: Record<string, string>` (default `{}`). Task 12 passes both.

The prop is optional with a default so every existing render and test keeps working untouched.

- [ ] **Step 1: Write the failing test** — create `tests/assessment/answer-form-reflection.test.ts`. This is a **source-read pin**, not a render test: the repo's form tests live in `tests/a11y/` and use that suite's own harness, so pinning the source keeps this task self-contained.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('components/answer-form.tsx', 'utf8');

describe('answer-form reflection textarea', () => {
  it('renders the textarea only for items that carry a prompt', () => {
    expect(src).toContain('{currentItem.reflection && (');
  });

  it('caps input at 2000 characters', () => {
    expect(src).toContain('maxLength={2000}');
  });

  it('associates a hint via aria-describedby', () => {
    expect(src).toContain('aria-describedby={`reflection-hint-${currentItem.id}`}');
    expect(src).toContain('id={`reflection-hint-${currentItem.id}`}');
  });

  it('labels the textarea with the item prompt', () => {
    expect(src).toContain('htmlFor={`reflection-${currentItem.id}`}');
    expect(src).toContain('id={`reflection-${currentItem.id}`}');
  });

  it('shows a remaining-characters counter near the cap', () => {
    expect(src).toContain('>= 1800');
    expect(src).toContain('characters left');
  });

  it('keeps reflections in state, seeded from an optional prop', () => {
    expect(src).toContain('initialReflections');
    expect(src).toContain('useState<Record<string, string>>');
  });

  it('sends the trimmed reflection for prompted items', () => {
    expect(src).toContain("reflection: (reflections[currentItem.id] ?? '').trim()");
  });

  it('keeps rating-only gating (an empty reflection never blocks Next)', () => {
    expect(src).not.toContain('reflections[currentItem.id] &&');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/assessment/answer-form-reflection.test.ts`
Expected: FAIL — none of these strings exist yet.

- [ ] **Step 3: Implement** — four edits in `components/answer-form.tsx`:

1. `AnswerFormItem` gains `reflection?: string;` after `anchors`.
2. Props gain `initialReflections?: Record<string, string>` — destructure with a default: `initialReflections = {}`.
3. Alongside the existing `values` state, add:

```tsx
const [reflections, setReflections] = useState<Record<string, string>>(initialReflections);
```

4. In `saveCurrent`, where it calls `onSaveAnswer({ item_id: currentItem.id, value: v })`, send the reflection **only for prompted items** — always, even when empty, so clearing the textarea clears the stored text:

```tsx
await onSaveAnswer(
  currentItem.reflection
    ? { item_id: currentItem.id, value: v, reflection: (reflections[currentItem.id] ?? '').trim() }
    : { item_id: currentItem.id, value: v },
);
```

(Keep the file's real call shape — if the result is assigned and checked, preserve that; only the argument changes.)

5. Insert this block immediately after the bands `</ul>` (:174), still inside the `<fieldset>`, before the nav buttons:

```tsx
{currentItem.reflection && (
  <div className="mt-6">
    <label htmlFor={`reflection-${currentItem.id}`} className="font-body text-sm text-ink">
      {currentItem.reflection}{' '}
      <span className="font-body text-xs text-ink-soft">(Optional)</span>
    </label>
    <textarea
      id={`reflection-${currentItem.id}`}
      value={reflections[currentItem.id] ?? ''}
      onChange={(e) => setReflections((prev) => ({ ...prev, [currentItem.id]: e.target.value }))}
      maxLength={2000}
      rows={4}
      aria-describedby={`reflection-hint-${currentItem.id}`}
      className="mt-2 w-full rounded-md border border-line bg-paper p-3 font-body text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    />
    <p id={`reflection-hint-${currentItem.id}`} className="font-body text-xs text-ink-soft">
      Optional — shown unattributed in your church&rsquo;s report.
    </p>
    {(reflections[currentItem.id] ?? '').length >= 1800 && (
      <p className="font-body text-xs text-ink-soft">
        {2000 - (reflections[currentItem.id] ?? '').length} characters left
      </p>
    )}
  </div>
)}
```

Do **not** touch `currentAnswered` — advancing still depends on the rating alone.

- [ ] **Step 4: Run the new test and the a11y suite**

Run: `npx vitest run tests/assessment/answer-form-reflection.test.ts` → PASS.
Run: `npx vitest run tests/a11y/` → green (`answer-form-wizard`, `pending-controls`, `live-regions-applied` all exercise this component).
Run: `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add components/answer-form.tsx tests/assessment/answer-form-reflection.test.ts
git commit -m "feat: optional reflection textarea on prompted assessment items"
```

### Task 12: answer page + self-form plumbing

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/self-form.tsx` (pass-through)
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx` (items map :30; prefill :34-42)
- Test: covered by Task 11's pins + `npx tsc --noEmit`; no new test file.

**Interfaces:**
- Consumes: Task 11's `initialReflections` prop and `AnswerFormItem.reflection`; Task 6's RPC third column.
- Produces: nothing new for later tasks.

- [ ] **Step 1: `self-form.tsx`** — it is a thin wrapper. Add `initialReflections` to its props type and pass it straight through to `<AnswerForm>`, mirroring exactly how `initialValues` is declared and forwarded. Make it optional (`initialReflections?: Record<string, string>`) for the same reason as Task 11.

- [ ] **Step 2: `page.tsx` — items map.** The map at :30 becomes:

```tsx
{ id: i.id, text: i.text, anchors: i.anchors, reflection: i.reflection }
```

- [ ] **Step 3: `page.tsx` — prefill.** The `get_my_category_answers` rows are cast to a local row type; widen it and build the second map:

```tsx
const rows = (data ?? []) as { item_id: string; value: number; reflection: string | null }[];
const initialValues: Record<string, number> = {};
const initialReflections: Record<string, string> = {};
for (const r of rows) {
  initialValues[r.item_id] = r.value;
  if (r.reflection) initialReflections[r.item_id] = r.reflection;
}
```

(Keep the file's existing loop/reduce style if it differs — the only requirements are that `initialValues` is built exactly as before and that null/empty reflections are skipped so the textarea starts empty rather than showing `"null"`.)

Then pass `initialReflections={initialReflections}` to `<SelfForm>` beside `initialValues`.

- [ ] **Step 4: Leave the review-only branch alone.** The read-only list at :73-121 renders past answers for a closed/complete window. The spec is silent on showing reflections there; v1 does not change it.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → 0.
Run: `npm run test` → green.
Run: `npm run lint` → 0.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/answer/[categoryId]/self-form.tsx" "app/app/[churchId]/answer/[categoryId]/page.tsx"
git commit -m "feat: prefill and forward reflections through the answer page"
```

### Task 13: `derive.ts` gains a required run version — **and all four call sites, in this one commit**

**Files:**
- Modify: `lib/report/derive.ts`
- Modify: `app/app/[churchId]/actions.ts` (`generateDiagnosis`)
- Modify: `app/app/[churchId]/diagnosis/page.tsx`
- Modify: `app/api/report/[runId]/pdf/route.ts`
- Modify: `app/r/[shareToken]/page.tsx`
- Test: `tests/report/derive.test.ts` (3 existing calls + new cases)

**Interfaces:**
- Consumes: Task 2's `effectiveMethodologyForRun`; Task 8's `methodology_version` on shared rows.
- Produces: `deriveDiagnosisForRun(responses, methodology, ctx, runMethodologyVersion: string | null)` — a **required** 4th parameter — whose `ok` arm gains `effectiveMethodology: Methodology`. Tasks 14–18 rely on the `reportMethodology` pattern this task establishes at each call site.

**This task is deliberately atomic.** The 4th parameter is required, so splitting it would leave `npx tsc --noEmit` red between commits. Reflections/opts plumbing comes later, per surface.

- [ ] **Step 1: Update the three existing calls + write the new failing cases** in `tests/report/derive.test.ts`.

First, every existing `deriveDiagnosisForRun(responses, methodology, ctx)` call gains `'0.3.0'` as a 4th argument. `'0.3.0'` does not predate, so the effective methodology is the *same reference* — the identity assertion (`result.diagnosis` equals `diagnose(responses, methodology, ctx)`) still holds, version stamp included.

Then append, using the file's existing `loadFixtureMethodology()` and `BAND = '100_249'`:

```ts
function withOutreachItem(m: Methodology): Methodology {
  const aug = structuredClone(m);
  const guest = aug.questions.categories.find((c) => c.id === 'guest')!;
  guest.items.push({
    id: 'G9',
    text: 'Synthetic outreach question',
    signal: 'evidence',
    since: '0.3.0',
    anchors: { lo: 'l', mid: 'm', hi: 'h' },
    reflection: 'Tell us.',
  } as (typeof guest.items)[number]);
  return aug;
}

describe('deriveDiagnosisForRun run version', () => {
  it('a pre-0.3.0 run scores against the old item list and stamps 0.2.0', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(responses, aug, { attendance_band: BAND }, '0.2.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnosis.methodology_version).toBe('0.2.0');
    expect(
      result.effectiveMethodology.questions.categories
        .find((c) => c.id === 'guest')!
        .items.map((i) => i.id),
    ).not.toContain('G9');
  });

  it('a null run version behaves like a pre-0.3.0 run', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(responses, aug, { attendance_band: BAND }, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diagnosis.methodology_version).toBe('0.2.0');
  });

  it('a 0.3.0 run gets the methodology back by reference', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(responses, aug, { attendance_band: BAND }, '0.3.0');
    if (result.ok) expect(result.effectiveMethodology).toBe(aug);
  });

  it('a 0.3.0 run with the new item unanswered is blocked on that area', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(responses, aug, { attendance_band: BAND }, '0.3.0');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'incomplete_areas') {
      expect(result.blockedAreas).toEqual(['guest']);
    }
  });
});
```

(The last two cases both derive with `'0.3.0'`; the reference check runs inside `if (result.ok)` precisely because the same call is expected to be blocked — keep both, they pin different things. If the fixture's responses already cover a `G9`-shaped id, pick an unused id instead.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/derive.test.ts`
Expected: FAIL — 4-argument calls don't typecheck and `effectiveMethodology` doesn't exist.

- [ ] **Step 3: Implement `derive.ts`**

```ts
export function deriveDiagnosisForRun(
  responses: Response[],
  methodology: Methodology,
  ctx: { attendance_band: string },
  runMethodologyVersion: string | null,
): DeriveResult {
  const effective = effectiveMethodologyForRun(methodology, runMethodologyVersion);
  const normalized = normalize(responses, effective);
  const blocked = diagnosisGate(normalized, effective.questions.categories);
  if (blocked.length > 0) return { ok: false, reason: 'incomplete_areas', blockedAreas: blocked };
  if (!isKnownBand(effective, ctx.attendance_band)) return { ok: false, reason: 'unknown_band' };
  return { ok: true, diagnosis: assemble(normalized, effective, ctx), effectiveMethodology: effective };
}
```

Keep the file's real local names and return-literal shapes — the delta is: import `effectiveMethodologyForRun`, compute `effective` first, use it in all four steps, and add `effectiveMethodology: effective` to the `ok` return. Widen `DeriveResult`'s ok arm to `{ ok: true; diagnosis: Diagnosis; effectiveMethodology: Methodology }`. `normalize`, `diagnosisGate`, and the engine stay byte-unchanged.

- [ ] **Step 4: Update all four call sites.** Each surface follows the same pattern: fetch the run's version → pass it into derive → compute `reportMethodology` → use it for the view and the prose thunk.

**4a. `app/app/[churchId]/actions.ts` — `generateDiagnosis`.** *Hoist* the run fetch that currently sits in the prose block (:102-108) to above the derive call, widening its select:

```ts
const { data: run } = await supabase
  .from('assessment_runs')
  .select('id, methodology_version')
  /* keep the existing filters/order/limit/single exactly as they were */;
```

Pass `run?.methodology_version ?? null` as derive's 4th argument. Delete the now-duplicate fetch inside the prose block and use the hoisted `run` there. Change `generateProse(diagnosis, methodology)` (:125) to `generateProse(diagnosis, derived.effectiveMethodology)` — that line is past the `!derived.ok` early return, so the field is guaranteed present. Add `reflection: string | null` to `RunResponseRow` (:15-21) for RPC-shape accuracy; it is unused here. The hash (:73) and `save_diagnosis` (:75-80) stay **byte-unchanged** — assemble already stamped the effective version. The failure-arm name lookups keep the current `categories`.

**4b. `app/app/[churchId]/diagnosis/page.tsx`.** Run fetch :45-51 `select('id, status')` → `select('id, status, methodology_version')`. Add `reflection: string | null` to `RunResponseRow` (:20-26). Pass `run.methodology_version ?? null` into derive (past the `!diagRow` early return at :69, `run` is non-null). Then:

```tsx
const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology;
```

Use `reportMethodology` as `resolveReportView`'s methodology argument **and** inside the prose thunk (`fallbackProse(d, reportMethodology)`). The `notScoreable` message (:119-129) keeps the current `methodology` for names. **`ReportBody`'s props at :154-157 stay byte-unchanged** — both `storedVersion` and `currentVersion` keep reading `methodology.questions.version`, which is what keeps the stale branch from firing on a re-derived old run.

**4c. `app/api/report/[runId]/pdf/route.ts`.** Run fetch :65-69 → append `, methodology_version` to the select string. Add `reflection: string | null` to `RunResponseRow` (:16-22). Derive (:97-99) gains `run!.methodology_version ?? null` (`run!` is already asserted at :88). Same `reportMethodology` line, same two uses (the `resolveReportView` argument and `fallbackProse(d, reportMethodology)` **inside** the thunk at :103-111). The 409 branch (:114-121) and `renderReportDocument` (:127-133) are untouched.

**4d. `app/r/[shareToken]/page.tsx`.** `SharedRunResponseRow` (:35-42) gains `methodology_version: string | null` — and, deliberately, **no** `reflection` field. Derive (:84-86) gains `responseRows[0]?.methodology_version ?? null`. Same `reportMethodology` line; use it for `resolveReportView` (:92-97, audience `'shared'`) and inside its thunk. Pass **no** reflections. The `SharedStaleMethodologyNotice` branch (:99-124) is untouched.

**Why `reportMethodology` is load-bearing, not cosmetic:** an old run's re-derived diagnosis stamps `'0.2.0'`. If the view were handed the *current* methodology, its internal version comparison would see a mismatch and the stale branch would fire on every legacy report. Passing the effective methodology keeps both sides equal.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/report/derive.test.ts` → PASS.
Run: `npx vitest run tests/report/route-call-ordering.test.ts` → PASS. (Verified at plan time: it only requires `resolveReportView(` to be present, `fallbackProse(`/`buildReportView(` never to appear outside that call, and any argument containing them to match `/^\s*\([^)]*\)\s*=>/`. Computing `reportMethodology` beforehand and calling `fallbackProse(d, reportMethodology)` inside the thunk all pass.)
Run: `npx vitest run tests/report/route-rederive.test.ts` → **read the failure if it fails.** This is a source-read tripwire on the routes that was not inspected at plan time. If it pins the derive call's shape or arity, update its expected strings to match the new 4-argument call — do not change the routes to satisfy a stale pin.
Run: `npx tsc --noEmit` → 0 (this is what proves all four call sites were updated).
Run: `npm run test` → green.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/derive.ts tests/report/derive.test.ts "app/app/[churchId]/actions.ts" "app/app/[churchId]/diagnosis/page.tsx" "app/api/report/[runId]/pdf/route.ts" "app/r/[shareToken]/page.tsx"
git commit -m "feat: derive scores each run against its own methodology version"
```

### Task 14: `lib/report/view.ts` — `outreachVoices`

**Files:**
- Modify: `lib/report/view.ts` (`AreaDossierView` :18-30; `buildAreas` :215-245; `buildReportView` :310-365; `resolveReportView` :392-409)
- Test: `tests/report/view.test.ts` (append cases)

**Interfaces:**
- Consumes: Task 13's `reportMethodology` at each call site.
- Produces: `export interface OutreachVoicesGroup { itemId: string; reflectionPrompt: string; entries: string[] }`; `AreaDossierView.outreachVoices?: OutreachVoicesGroup[]`; `buildReportView`'s opts gain `reflections?: Array<{ item_id: string; reflection: string | null }>`. Tasks 15–17 render this exact shape; Tasks 16–17 supply the opt.

- [ ] **Step 1: Write the failing tests** — append to `tests/report/view.test.ts`, using its existing `diagnosis()` / `blocks()` helpers:

```ts
function withReflectionItem(m: Methodology): Methodology {
  const aug = structuredClone(m);
  aug.questions.categories[0].items.push({
    id: 'X9', text: 'q', signal: 'evidence', since: '0.3.0',
    anchors: { lo: 'l', mid: 'm', hi: 'h' }, reflection: 'Tell us.',
  } as (typeof aug.questions.categories)[number]['items'][number]);
  return aug;
}

describe('outreachVoices', () => {
  const reflections = [
    { item_id: 'X9', reflection: '  zebra story  ' },
    { item_id: 'X9', reflection: 'apple story' },
    { item_id: 'X9', reflection: '   ' },
    { item_id: 'X9', reflection: null },
  ];

  it('groups, trims, drops empties and sorts deterministically', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen', reflections });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0].id)!;
    expect(area.outreachVoices).toHaveLength(1);
    expect(area.outreachVoices![0].itemId).toBe('X9');
    expect(area.outreachVoices![0].reflectionPrompt).toBe('Tell us.');
    expect(area.outreachVoices![0].entries).toEqual(['apple story', 'zebra story']);
  });

  it('omits the field entirely when no reflections are given', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen' });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('never populates voices on the shared audience', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'shared', reflections });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('omits groups whose entries are all empty', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [{ item_id: 'X9', reflection: '   ' }],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('ignores reflections for items the methodology does not prompt', () => {
    const view = buildReportView(diagnosis(), blocks(), methodology, {
      audience: 'screen',
      reflections: [{ item_id: 'X9', reflection: 'orphan' }],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });
});
```

(Use the test file's own name for the methodology fixture in scope. The last case is the pre-0.3.0 safety net: an effective methodology has no prompted items, so old runs render no voices even if reflection rows exist.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/view.test.ts`
Expected: FAIL — `outreachVoices` is not a property and the opts type rejects `reflections`.

- [ ] **Step 3: Implement** — four edits in `lib/report/view.ts`:

1. Export the group type and add the optional field to `AreaDossierView`:

```ts
export interface OutreachVoicesGroup {
  itemId: string;
  reflectionPrompt: string;
  entries: string[];
}
```

```ts
  outreachVoices?: OutreachVoicesGroup[];
```

2. Add the private builder (pure; no imports beyond what the file already has):

```ts
function buildOutreachVoices(
  methodology: Methodology,
  reflections: Array<{ item_id: string; reflection: string | null }>,
): Map<string, OutreachVoicesGroup[]> {
  const byCategory = new Map<string, OutreachVoicesGroup[]>();
  for (const cat of methodology.questions.categories) {
    const groups: OutreachVoicesGroup[] = [];
    for (const item of cat.items) {
      if (!item.reflection) continue;
      const entries = reflections
        .filter((r) => r.item_id === item.id && r.reflection !== null)
        .map((r) => (r.reflection as string).trim())
        .filter((t) => t.length > 0)
        // Plain lexicographic compare — deterministic across locales. Never localeCompare.
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (entries.length === 0) continue;
      groups.push({ itemId: item.id, reflectionPrompt: item.reflection, entries });
    }
    if (groups.length > 0) byCategory.set(cat.id, groups);
  }
  return byCategory;
}
```

3. `buildAreas` gains a `voices: Map<string, OutreachVoicesGroup[]>` parameter and attaches via a conditional spread, so an area without voices has no `undefined`-valued key:

```ts
const v = voices.get(categoryId);
return { /* ...every existing field, unchanged... */, ...(v ? { outreachVoices: v } : {}) };
```

4. `buildReportView`'s opts type gains `reflections?: Array<{ item_id: string; reflection: string | null }>`, and it computes the map before calling `buildAreas`:

```ts
const voices =
  opts.audience !== 'shared' && opts.reflections
    ? buildOutreachVoices(methodology, opts.reflections)
    : new Map<string, OutreachVoicesGroup[]>();
```

`resolveReportView` needs no logic change — its opts parameter type widens and it passes opts through.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/view.test.ts` → PASS.
Run: `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add lib/report/view.ts tests/report/view.test.ts
git commit -m "feat: report view groups reflections into outreach voices (never shared)"
```

### Task 15: `dossier.tsx` — render the voices block

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/dossier.tsx` (append inside `<section>`, after `</dl>`)
- Test: `tests/report/components.test.ts` (append cases)

**Interfaces:**
- Consumes: Task 14's `AreaDossierView.outreachVoices`.
- Produces: on-screen voices markup. Task 17 mirrors it for PDF.

Render with plain JSX so the suite's `textOf()` — which walks `children` props and never invokes nested component bodies — can see it.

- [ ] **Step 1: Write the failing test** — append to `tests/report/components.test.ts`, calling the component function directly the way the file's other dossier cases do:

```ts
const areaWithVoices = {
  ...baseArea,
  outreachVoices: [
    { itemId: 'G6', reflectionPrompt: 'Tell us about one person.', entries: ['She came back.', 'He stayed.'] },
  ],
} as unknown as AreaDossierView;

it('renders outreach voices when the area carries them', () => {
  const text = textOf(AreaDossier({ area: areaWithVoices }));
  expect(text).toContain('Voices on outreach');
  expect(text).toContain('Tell us about one person.');
  expect(text).toContain('She came back.');
  expect(text).toContain('He stayed.');
});

it('renders no voices heading when the area has none', () => {
  const text = textOf(AreaDossier({ area: baseArea }));
  expect(text).not.toContain('Voices on outreach');
});
```

(`baseArea` = a full `AreaDossierView` fixture with all eleven required fields — build it the way the file's existing dossier cases build theirs, reusing that fixture if one is already in scope.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/components.test.ts`
Expected: FAIL — "Voices on outreach" is not rendered.

- [ ] **Step 3: Implement** — insert after `</dl>`, still inside `<section>`:

```tsx
{area.outreachVoices?.length ? (
  <div className="mt-4">
    <p className="font-body text-xs uppercase tracking-wide text-ink-soft">Voices on outreach</p>
    {area.outreachVoices.map((group) => (
      <div key={group.itemId} className="mt-2">
        <p className="font-body text-sm text-ink-soft">{group.reflectionPrompt}</p>
        {group.entries.map((entry, i) => (
          <blockquote key={i} className="mt-1 border-l-2 border-line pl-3 font-body text-sm text-ink">
            {entry}
          </blockquote>
        ))}
      </div>
    ))}
  </div>
) : null}
```

No empty state — the builder already omits zero-entry groups.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/components.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/report/dossier.tsx" tests/report/components.test.ts
git commit -m "feat: render outreach voices in the on-screen area dossier"
```

### Task 16: screen surface — feed reflections into the view

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx` (Response map region :87-96; `resolveReportView` opts :105-113)
- Test: covered by Task 14's view tests + `npx tsc --noEmit`; no new test file.

**Interfaces:**
- Consumes: Task 7's `reflection` column on `get_completed_run_responses`; Task 14's `reflections` opt.
- Produces: nothing new.

- [ ] **Step 1: Build the reflections array.** `RunResponseRow` already gained `reflection: string | null` in Task 13. Beside the existing `Response[]` map (which stays exactly as it is — `Response` has no reflection field), derive a second array from the same raw rows:

```tsx
const reflections = rows.map((r) => ({ item_id: r.item_id, reflection: r.reflection }));
```

(Use the file's real name for the raw RPC rows.)

- [ ] **Step 2: Pass it.** The opts argument `{ audience: 'screen' }` becomes `{ audience: 'screen', reflections }`. The `reportMethodology` argument from Task 13 stays as it is.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → 0.
Run: `npm run test` → green.

- [ ] **Step 4: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/page.tsx"
git commit -m "feat: on-screen report receives reflections"
```

### Task 17: PDF — voices in the document, reflections in the route

**Files:**
- Modify: `lib/report/pdf/document.tsx` (`AreaDossierBlock` :176-191; styles near :78-84)
- Modify: `app/api/report/[runId]/pdf/route.ts` (reflections array; opts :111)
- Test: `tests/report/pdf-voices.test.ts` (new)

**Interfaces:**
- Consumes: Task 14's `outreachVoices`.
- Produces: nothing new.

`lib/report/pdf/render.ts:28` — the fail-closed guard checking both `view.dispersion?.respondents.length` and `view.system?.disagreement?.respondents.length` — stays **byte-unchanged**. Voices are unattributed strings and add no respondent identity.

- [ ] **Step 1: Write the failing test** — create `tests/report/pdf-voices.test.ts`, mirroring the imports and pdf-parse text extraction used by `tests/report/pdf-document.test.ts` / `render.test.ts`:

```ts
it('prints outreach voices when an area carries them', async () => {
  const view = /* the suite's standard view fixture */;
  view.areas[0].outreachVoices = [
    { itemId: 'G6', reflectionPrompt: 'Tell us about one person.', entries: ['She came back.'] },
  ];
  const text = await extractText(await renderReportDocument(view /* + the fixture's other args */));
  expect(text).toContain('Voices on outreach');
  expect(text).toContain('Tell us about one person.');
  expect(text).toContain('She came back.');
});

it('prints no voices section when no area carries them', async () => {
  const view = /* the same fixture, untouched */;
  const text = await extractText(await renderReportDocument(view /* + the fixture's other args */));
  expect(text).not.toContain('Voices on outreach');
});
```

Reuse the sibling suite's fixture builder and its text-extraction helper verbatim rather than writing new ones — the `/* … */` regions above are the two places to drop in the neighbor file's real expressions.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/pdf-voices.test.ts`
Expected: FAIL — the first case; "Voices on outreach" never appears.

- [ ] **Step 3: Restructure `AreaDossierBlock`.** The header row and six `DossierField`s currently sit inside one `<View style={s.dossier} wrap={false}>`. Keep those seven atomic, but let long quotes flow across a page break — outer `View` carries the style, an inner `wrap={false}` wraps the existing content, and voices become a sibling:

```tsx
function AreaDossierBlock({ area }: { area: AreaDossierView }) {
  const voices = area.outreachVoices ?? [];
  return (
    <View style={s.dossier}>
      <View wrap={false}>
        {/* the existing headerRow + six DossierFields, byte-identical */}
      </View>
      {voices.length > 0 && (
        <View>
          <Text style={s.voicesLabel}>Voices on outreach</Text>
          {voices.map((group) => (
            <View key={group.itemId}>
              <Text style={s.voicesPrompt}>{group.reflectionPrompt}</Text>
              {group.entries.map((entry, i) => (
                <Text key={i} style={s.voicesQuote}>{entry}</Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

Append three style keys to the stylesheet near the existing dossier styles (matching its conventions: labels are fontSize 8 uppercase `INK_SOFT`, values fontSize 10):

```ts
  voicesLabel: { fontSize: 8, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  voicesPrompt: { fontSize: 9, color: INK_SOFT, marginTop: 3 },
  voicesQuote: { fontSize: 10, marginTop: 2, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: RULE },
```

- [ ] **Step 4: Feed the route.** In `app/api/report/[runId]/pdf/route.ts`, build the reflections array beside the `responses` map (:90-96) exactly as Task 16 does, and change the opts at :111 from `{ audience: 'pdf' }` to `{ audience: 'pdf', reflections }`.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/report/pdf-voices.test.ts` → PASS.
Run: `npx vitest run tests/report/` → green (the restructure must not disturb `pdf-document` / `render` snapshots or the fail-closed guard test).
Run: `npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/pdf/document.tsx "app/api/report/[runId]/pdf/route.ts" tests/report/pdf-voices.test.ts
git commit -m "feat: outreach voices in the PDF report"
```

### Task 18: shared-surface exclusion tripwire

**Files:**
- Test: `tests/outreach/shared-exclusion.test.ts` (new)
- No source change — Task 13 (4d) already added `methodology_version` to `SharedRunResponseRow` and deliberately left reflection out.

**Interfaces:**
- Consumes: Tasks 8, 13, 14.
- Produces: a standing guard. If someone later "helpfully" plumbs reflections into the share path, this fails.

- [ ] **Step 1: Write the test** (it should pass immediately — that is the point; it locks in work already done):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Comments explain WHY reflections are excluded; strip them so the prose
// cannot satisfy an absence assertion.
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');
const stripSql = (s: string) => s.replace(/--[^\n]*$/gm, '');

const sharedSql = stripSql(
  readFileSync(
    'supabase/migrations/20260807000600_rpc_get_shared_run_responses_methodology_version.sql',
    'utf8',
  ),
);
const sharedPage = stripTs(readFileSync('app/r/[shareToken]/page.tsx', 'utf8'));

describe('the shared report surface never carries reflections', () => {
  it('layer 1 — SQL returns no reflection, but does return the run version', () => {
    expect(sharedSql).not.toContain('reflection');
    expect(sharedSql).toContain('methodology_version');
  });

  it('layer 2 — the shared row type has no reflection field', () => {
    expect(sharedPage).not.toContain('reflection');
  });

  it('layer 3 — the shared page passes no reflections opt to the view', () => {
    expect(sharedPage).not.toContain('reflections');
    expect(sharedPage).toContain("audience: 'shared'");
  });

  it('the shared page does read the run version for derive', () => {
    expect(sharedPage).toContain('methodology_version');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/outreach/shared-exclusion.test.ts`
Expected: PASS. If layer 2 or 3 fails, the shared page picked up a reflection reference it must not have — remove it there, never weaken this test.

- [ ] **Step 3: Commit**

```bash
git add tests/outreach/shared-exclusion.test.ts
git commit -m "test: lock the three-layer shared-surface reflection exclusion"
```

### Task 19: `lib/coverage/exemption.ts`

**Files:**
- Create: `lib/coverage/exemption.ts`
- Test: `tests/coverage/exemption.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `predatesOutreach`.
- Produces: `isExemptMember(deadlineAt: string | null, runMethodologyVersion: string | null, now: Date): boolean`. Task 21 calls it.

- [ ] **Step 1: Write the failing test** — create `tests/coverage/exemption.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isExemptMember } from '@/lib/coverage/exemption';

const NOW = new Date('2026-08-07T12:00:00.000Z');
const PAST = '2026-08-01T12:00:00.000Z';
const FUTURE = '2026-08-20T12:00:00.000Z';

describe('isExemptMember', () => {
  it('no deadline means no exemption', () => {
    expect(isExemptMember(null, '0.2.0', NOW)).toBe(false);
  });
  it('an open window means no exemption', () => {
    expect(isExemptMember(FUTURE, '0.2.0', NOW)).toBe(false);
  });
  it('closed window on a pre-0.3.0 run exempts', () => {
    expect(isExemptMember(PAST, '0.2.0', NOW)).toBe(true);
  });
  it('closed window on a null-version run exempts', () => {
    expect(isExemptMember(PAST, null, NOW)).toBe(true);
  });
  it('closed window on a 0.3.0 run does NOT exempt', () => {
    expect(isExemptMember(PAST, '0.3.0', NOW)).toBe(false);
  });
  it('at the boundary instant the window is still open', () => {
    expect(isExemptMember(NOW.toISOString(), '0.2.0', NOW)).toBe(false);
  });
});
```

The boundary case mirrors the SQL: `20260801000400:39` uses a strict `now() > assessment_deadline_at`, so at the exact instant the member can still write.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/coverage/exemption.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `lib/coverage/exemption.ts`:

```ts
import { predatesOutreach } from '../methodology/effective';

/**
 * "Closed window, closed test." A member whose answering window has passed cannot be
 * asked for questions that did not exist when it was open — so on pre-0.3.0 runs their
 * progress is measured against the old item list.
 *
 * Mirrors 20260801000400's STRICT `now() > assessment_deadline_at`: at the boundary
 * instant the window is still open, so there is no exemption yet.
 */
export function isExemptMember(
  deadlineAt: string | null,
  runMethodologyVersion: string | null,
  now: Date,
): boolean {
  if (deadlineAt === null) return false;
  if (!predatesOutreach(runMethodologyVersion)) return false;
  return now.getTime() > new Date(deadlineAt).getTime();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/coverage/exemption.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/coverage/exemption.ts tests/coverage/exemption.test.ts
git commit -m "feat: isExemptMember — closed window on a pre-0.3.0 run"
```

### Task 20: `buildMemberMatrix` — per-member exempt totals

**Files:**
- Modify: `lib/coverage/member-matrix.ts` (`MatrixMember` :12-16; `buildMemberMatrix` :33-47)
- Test: `tests/coverage/member-matrix.test.ts` (fixtures + new cases)
- Also fix fixtures in: `tests/dashboard/member-matrix.test.ts`, `tests/coverage/diagnosis-gate.test.ts`, `tests/coverage/partial-nudge.test.ts` (wherever a member object is built)

**Interfaces:**
- Consumes: Task 19's `isExemptMember`; Task 2's `effectiveMethodologyForRun`.
- Produces: `MatrixMember` gains a **required** `assessment_deadline_at: string | null`; `buildMemberMatrix(members, rows, categories, opts?)` where `opts?: { isExempt: (m: MatrixMember) => boolean; effectiveCategories: Category[] }`. Task 21 passes it.

The field is required because `get_church_members` already returns it — only the TypeScript type widens, no data change. Cells stay one per category; only the per-member *total* each cell is classified against changes.

- [ ] **Step 1: Write the failing tests.** First add `assessment_deadline_at: null` to every member fixture in the four test files above (start with `tests/coverage/member-matrix.test.ts:12-15`); `npx tsc --noEmit` will name any you miss. Then append:

```ts
const EXEMPT_MEMBER = { user_id: 'u1', full_name: 'A', email: 'a@x.com', assessment_deadline_at: '2026-08-01T00:00:00.000Z' };
const OPEN_MEMBER = { user_id: 'u2', full_name: 'B', email: 'b@x.com', assessment_deadline_at: null };

// categories: one with 3 items, of which the 3rd is a 0.3.0 item.
// effectiveCategories: the same category with only its first 2 items.

it('an exempt member who answered the old items counts as covered', () => {
  const matrix = buildMemberMatrix([EXEMPT_MEMBER], [{ respondent_user_id: 'u1', category_id: 'guest', answered_count: 2 }], categories, {
    isExempt: (m) => m.user_id === 'u1',
    effectiveCategories,
  });
  expect(matrix[0].cells[0].status).toBe('covered');
});

it('a non-exempt member with the same answers is still partial', () => {
  const matrix = buildMemberMatrix([OPEN_MEMBER], [{ respondent_user_id: 'u2', category_id: 'guest', answered_count: 2 }], categories, {
    isExempt: () => false,
    effectiveCategories,
  });
  expect(matrix[0].cells[0].status).toBe('partial');
});

it('without opts, behaviour is exactly as before', () => {
  const matrix = buildMemberMatrix([OPEN_MEMBER], [{ respondent_user_id: 'u2', category_id: 'guest', answered_count: 2 }], categories);
  expect(matrix[0].cells[0].status).toBe('partial');
  expect(matrix[0].cells).toHaveLength(categories.length);
});

it('an exempt member still gets one cell per category', () => {
  const matrix = buildMemberMatrix([EXEMPT_MEMBER], [], categories, {
    isExempt: () => true,
    effectiveCategories,
  });
  expect(matrix[0].cells).toHaveLength(categories.length);
});
```

(Use the file's own fixture names and its real cell/status property names.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/coverage/member-matrix.test.ts`
Expected: FAIL — `buildMemberMatrix` takes three arguments; the exempt case classifies `partial`.

- [ ] **Step 3: Implement.** `MatrixMember` gains `assessment_deadline_at: string | null;`. `buildMemberMatrix` gains the optional 4th parameter and, per member, builds the totals map it classifies against:

```ts
const totals = new Map(
  (opts && opts.isExempt(member) ? opts.effectiveCategories : categories).map((c) => [c.id, c.items.length]),
);
```

Each cell then classifies `answeredCount` against `totals.get(cat.id) ?? cat.items.length`, iterating `categories` exactly as before so the cell list is unchanged. `classify`'s semantics and `lib/coverage/coverage.ts` stay untouched, as do `diagnosis-gate.ts` and `partial-nudge.ts` (they only consume matrix rows).

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/coverage/ tests/dashboard/` → green.
Run: `npx tsc --noEmit` → 0 (this catches every fixture still missing the new field).

- [ ] **Step 5: Commit**

```bash
git add lib/coverage/member-matrix.ts tests/coverage/member-matrix.test.ts tests/dashboard/member-matrix.test.ts tests/coverage/diagnosis-gate.test.ts tests/coverage/partial-nudge.test.ts
git commit -m "feat: member matrix classifies exempt members against their run's items"
```

### Task 21: dashboard — wire the exemption

**Files:**
- Modify: `app/app/[churchId]/page.tsx` (run fetch hoist; coverage :86; CTA :91-100; per-card counter :227-229; matrix :115-124; admin `hasDiagnosis` :143-160)
- Test: `tests/outreach/dashboard-exemption-wiring.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 19 + 20 + 2.
- Produces: nothing for later tasks.

**Scope reminder (the accepted mismatch):** exemption applies to the **viewer's own progress** and the **matrix totals** only. The admin church-wide header stays on the full `categories` — and the area count is 8 either way, since the filter drops items, never categories.

- [ ] **Step 1: Write the failing tripwire** — create `tests/outreach/dashboard-exemption-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/app/[churchId]/page.tsx', 'utf8');

describe('dashboard exemption wiring', () => {
  it('computes exemption from the run version and the deadline', () => {
    expect(src).toContain('isExemptMember(');
    expect(src).toContain('effectiveMethodologyForRun(');
  });

  it('fetches the run version exactly once', () => {
    expect(src.split('methodology_version').length - 1).toBeGreaterThan(0);
    expect(src.split("select('id, methodology_version')").length - 1).toBe(1);
  });

  it('per-card totals come from the exempt-aware list, not a hardcoded length', () => {
    expect(src).toContain('ownTotalById');
    expect(src).not.toContain('of {cat.items.length}');
  });

  it('the admin church-wide result still uses the full category list', () => {
    expect(src).toContain('coverage(rows, categories)');
  });
});
```

(Adjust the third assertion's string to the counter's real JSX once you see it — the requirement is that `cat.items.length` no longer feeds the per-card counter.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/outreach/dashboard-exemption-wiring.test.ts`
Expected: FAIL — none of these symbols exist in the page yet.

- [ ] **Step 3: Implement**, in this order:

1. **Hoist one run fetch** above the coverage RPC (RLS `runs_select` lets viewers read runs, so this is legitimate for both roles):

```tsx
const { data: run } = await supabase
  .from('assessment_runs')
  .select('id, methodology_version')
  /* same filters/order/limit/single the admin hasDiagnosis block used */;
```

Delete the run select inside the admin `hasDiagnosis` block (:143-160) and reuse this row for its diagnoses probe.

2. **Compute exemption and the exempt-aware list:**

```tsx
const exempt = isExemptMember(deadlineAt, run?.methodology_version ?? null, new Date());
const exemptAwareCats = exempt
  ? effectiveMethodologyForRun(methodology, run?.methodology_version ?? null).questions.categories
  : categories;
```

3. **Viewer coverage** uses `exemptAwareCats`; the **admin** `result` stays `coverage(rows, categories)`. The admin's own-CTA refetch feeds the same list to both calls: `coverage(memberCoverageData, exemptAwareCats)` and `assessmentCta(ctaResult, exemptAwareCats)` — they must never disagree.

4. **Per-card counter.** Build `const ownTotalById = new Map(exemptAwareCats.map((c) => [c.id, c.items.length]));` and use `ownTotalById.get(cat.id) ?? cat.items.length` where :227-229 hardcodes `cat.items.length`. Cards still render all 8 via `categories.map`.

5. **Matrix.** The call gains the opts object:

```tsx
buildMemberMatrix(rosterRows, matrixRows, categories, {
  isExempt: (m) => isExemptMember(m.assessment_deadline_at, run?.methodology_version ?? null, new Date()),
  effectiveCategories: exemptAwareCats,
});
```

`dashboardGate` and `partialNudges` stay untouched — their behavior shifts through the cells.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/outreach/dashboard-exemption-wiring.test.ts` → PASS.
Run: `npm run test` → green.
Run: `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/page.tsx" tests/outreach/dashboard-exemption-wiring.test.ts
git commit -m "feat: dashboard exempts closed-window members on pre-0.3.0 runs"
```

### Task 22: anonymity note — one sentence, full variant only

**Files:**
- Modify: `components/anonymity-note.tsx` (the `full` variant string only)
- Test: `tests/assessment/answer-anonymity-note.test.ts`, `tests/access/accept-anonymity-note.test.ts` (update pins)

**Interfaces:** none produced.

The component has `full` (default) and `short` variants sharing the lead "Your answers are private." The answer page and the invite-accept page use `full`; the dashboard uses `short` and must not change.

- [ ] **Step 1: Update the copy pins.** In both test files, extend the expected full-variant copy with the new sentence:

```
Anything you type in an optional reflection appears in the report exactly as written, unattributed — never with your name.
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/assessment/answer-anonymity-note.test.ts tests/access/accept-anonymity-note.test.ts`
Expected: FAIL — the sentence is not in the component.

- [ ] **Step 3: Implement.** Append that sentence to the **full** variant string, matching the file's existing sentence-joining style. Leave the `short` variant untouched.

- [ ] **Step 4: Verify — including what must NOT change**

Run: `npx vitest run tests/assessment/answer-anonymity-note.test.ts tests/access/accept-anonymity-note.test.ts` → PASS.
Run: `npx vitest run tests/dashboard/dashboard-intro-statement.test.ts` → PASS **unchanged** (short variant; if this fails, the edit leaked into the shared lead — fix the component, not the test).
Run: `npx vitest run tests/report/anonymity-note.test.ts` → inspect. It pins the report-surface note and is expected to be unrelated; leave it alone unless it fails.

- [ ] **Step 5: Commit**

```bash
git add components/anonymity-note.tsx tests/assessment/answer-anonymity-note.test.ts tests/access/accept-anonymity-note.test.ts
git commit -m "feat: anonymity note explains how reflections appear in the report"
```

### Task 23: AI-exclusion tripwire

**Files:**
- Test: `tests/outreach/ai-exclusion.test.ts` (new)
- No source change — this feature makes **zero** changes under `lib/ai/`.

**Interfaces:** none.

Prose generation must keep working from ratings alone. Reflections are member-authored free text; routing them into a model is a product decision nobody has made.

- [ ] **Step 1: Write the test**

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');

const files = readdirSync('lib/ai', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

describe('AI prose never reads reflections', () => {
  it('finds the ai module', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s references neither reflection nor outreachVoices', (file) => {
    const src = stripTs(readFileSync(`lib/ai/${file}`, 'utf8'));
    expect(src).not.toContain('reflection');
    expect(src).not.toContain('outreachVoices');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: PASS immediately (verified at plan time: `grep -rn "reflection\|outreachVoices" lib/ai/` is empty). If `readdirSync`'s recursive option is unavailable on this Node version, list the directory non-recursively instead — coverage of the top level is sufficient.

- [ ] **Step 3: Commit**

```bash
git add tests/outreach/ai-exclusion.test.ts
git commit -m "test: prose generation stays rating-only"
```

### Task 24: full gates

**Files:** none — this task changes nothing.

- [ ] **Step 1: All four gates, in order**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

```bash
npm run lint
```
Expected: 0 errors, 0 warnings.

```bash
npm run test
```
Expected: green — the 706 pre-existing tests plus everything added here. If the total is lower than 706 + new, a suite was skipped; investigate rather than proceeding.

```bash
npm run build
```
Expected: clean. ("Vercel unstable"/`UNSTABLE` in PR CI is a `cornerleague` permissions artifact, not a code failure.)

- [ ] **Step 2: Confirm nothing stray is staged or committed**

```bash
git status --short
git log --oneline master..HEAD
```
Expected: `.claude/`, `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`, and `docs/superpowers/plans/2026-08-01-assessment-deadlines.md` still show as untracked (`??`) and appear in no commit.

- [ ] **Step 3: Confirm the hard locks held**

```bash
git diff master..HEAD --stat -- lib/engine lib/coverage/diagnosis-gate.ts "app/app/[churchId]/diagnosis/report/shared.tsx"
```
Expected: empty output. If any of these appear, revert that hunk — they are byte-locked by the spec.

- [ ] **Step 4: Hand back to Natalie.** Report the four gate results with their actual output, and restate the Owner TODO: apply migrations `20260807000100`–`20260807000600` in order, run `npm run test:db` for pgTAP 24, then merge. **The agent does not push this branch and does not merge.**
