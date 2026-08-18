# XPG Executive Report Reliability (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the executive report's AI sections from a live baseline of 0–1 of 7 to ≥ 6 of 7 across 3 consecutive runs, without changing what any section says and without weakening any gate.

**Architecture:** Instrument the gate so it returns a typed `GateFailure` instead of a bare string; tell the model its length budget up front; make the *already existing* blind re-attempt at `lib/report/compose.ts:74` corrective by threading that failure back as one extra system instruction; then fix whichever of two suspected false rejections the instrumentation actually confirms; then size timeout/retries/`maxDuration` against measured compliant-call latency.

**Tech Stack:** TypeScript, Next.js (App Router, Server Actions), Zod v4, OpenAI Node SDK (`responses.parse` + `zodTextFormat`), vitest, Supabase (local).

**Plan of record:** `docs/superpowers/specs/2026-08-17-xpg-executive-report-reliability-design.md` (commit `d0310b9`). Every task below cites the spec section it implements. Where this plan and the spec disagree, **escalate — do not silently pick one.**

## Global Constraints

- ⛔ **Never** run `npm run test:db`, `supabase db push`, or `supabase db reset`.
- ⛔ **Never** push to `master`, never force-push. Branch is `feat/ai-generative-diagnosis-prose`.
- ⛔ **Never** handle, echo, print, or commit the OpenAI API key. `.env.local` is never staged.
- ⛔ **No new dependencies.** Not one.
- Stage with **explicit git paths only**; never stage `.claude/`. Use `GIT_LITERAL_PATHSPECS=1` for any path containing `[churchId]` / `[categoryId]`.
- `npm test` does **not** typecheck. Run `npm run typecheck` at every shared-schema boundary. `gateSection`'s return type **is** one — Task 1 changes it, so Task 1 ends with a typecheck.
- `lib/ai/**` is under `eslint` `globalIgnores` (`eslint.config.mjs:12`). A green lint proves nothing about `sections.ts` or `section-gates.ts`. `tsc` and `vitest` are the gates.
- Bump `methodology/report.yaml` `version` (currently `"0.3.0"` at line 8) → `"0.4.0"` **only if** a `length_ceiling` value changes. If any ceiling changes and the version does not, `lib/report/report-hash.ts` serves stale cached reports. A code-only 2a needs no bump.
- **Gates are never weakened.** `anonymity` stays fail-closed and its matching behaviour is unchanged in 2a. `numeric containment` and `category coverage` are corrected only where they demonstrably reject *compliant* output.
- Log discipline (`lib/ai/sections.ts:144-147`): **reasons only** — never the payload, the parsed output, section text, or the facts pack.
- Baseline to beat: run A = 0 of 7, run B = 1 of 7 (`s5` only), both **post-retry**. `AI_SECTION_IDS` is `s2, s4, s5, s6, s7, s9, s12` — the denominator is **7**, not 12. `s1, s3, s8, s10, s11` are deterministic by design and always report `fallback`.

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `lib/ai/section-gates.ts` | Modify | Pure gate. Returns typed `GateFailure`. Also owns the pure `correctiveInstruction` builder (it must stay exhaustive over `GateFamily`, so it lives beside the union). |
| `lib/ai/sections.ts` | Modify | Registry + the one SDK call. Gains `wordBudget`/`budgetSentence` and an optional corrective system message on `composeSection`. |
| `lib/report/compose.ts` | Modify | Orchestration. Threads the first attempt's `GateFailure` into the re-attempt; logs `family (detail)`. |
| `app/app/[churchId]/page.tsx` (+ `diagnosis/page.tsx` if confirmed) | Modify | Route-segment `maxDuration` export. Task 5 confirms which segments actually host the two `composeReport` call sites. |
| `methodology/report.yaml` | Conditional | Copy only. Touched **only** if calibration moves a `length_ceiling`; then the `version` bump is mandatory. |
| `tests/ai/section-gates.test.ts` | Modify | Return-shape update + one case per family asserting `family` **and** `detail`. |
| `tests/ai/corrective.test.ts` | Create | Pure unit for `correctiveInstruction`, incl. exhaustiveness over `GateFamily`. |
| `tests/ai/budget.test.ts` | Create | Pure unit for `wordBudget` arithmetic and the margin. |
| `tests/report/compose.test.ts` | Modify | Log format + retry call shape; budget line present on attempt 1; corrective present on attempt 2; **absent** after `anonymity`. |

---

### Task 1: Typed gate failures (spec §4.1)

Instrumentation only. **No behaviour change** — every input that passes today still passes, every input that fails today still fails with the same family. This task exists to produce the evidence Task 4 is conditional on.

**Files:**
- Modify: `lib/ai/section-gates.ts` (every `return '<family>'` site, and the signature at line 50)
- Modify: `lib/report/compose.ts:51-55` (log format)
- Test: `tests/ai/section-gates.test.ts` (~40 assertion sites currently compare against bare strings)
- Test: `tests/report/compose.test.ts:325-335` (the log-format assertion)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type GateFamily =
    | 'field parity' | 'category coverage' | 'numeric containment'
    | 'required mention' | 'banned phrase' | 'anonymity'
    | 'pattern claim' | 'length ceiling';
  export interface GateFailure { family: GateFamily; detail: string }
  export function gateSection(id: AiSectionId, parsed: unknown, ctx: GateContext): GateFailure | null;
  ```
  Tasks 3 and 4 both depend on this exact shape.

**Detail content per family — this is a security boundary, not a formatting choice:**

| Family | `detail` | Source of the string |
|---|---|---|
| `length ceiling` | `"1834/1400"` | our own measurement + `report.yaml` |
| `numeric containment` | `"90"` | the offending number, already a parsed `number` |
| `category coverage` | `"empty"` / `"unknown: xyz"` / `"duplicate: comm"` / `"missing: comm, sys"` | ours, except `unknown:` which is model output — **truncate to 24 chars** |
| `required mention` | `"tier_name"` | the `RequiredMention` **key**, never the value |
| `banned phrase` | the matched phrase | `report.yaml`, not the church |
| `anonymity` | `"label 2"` | **the index only.** A respondent label is PII; logging it would defeat the gate it belongs to. |
| `field parity`, `pattern claim` | `""` | — |

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/section-gates.test.ts` a new `describe` block. These assert the *new* shape; the ~40 existing `.toBe('field parity')`-style assertions are updated mechanically in Step 3b.

```ts
describe('gate failure detail (spec §4.1)', () => {
  it('length ceiling reports actual/limit', () => {
    const ceiling = methodology.report.sections.s2.length_ceiling;
    const bloated = { ...goodS2, summary: goodS2.summary + 'x'.repeat(ceiling) };
    const f = gateSection('s2', bloated, ctx);
    expect(f?.family).toBe('length ceiling');
    expect(f?.detail).toMatch(/^\d+\/1400$/);
    expect(Number(f!.detail.split('/')[0])).toBeGreaterThan(ceiling);
  });

  it('numeric containment reports the offending number and nothing else', () => {
    const f = gateSection('s2', { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' }, ctx);
    expect(f).toEqual({ family: 'numeric containment', detail: '37' });
  });

  it('category coverage distinguishes empty, unknown, duplicate and missing', () => {
    expect(gateSection('s5', { strengths: [] }, ctx)).toEqual({ family: 'category coverage', detail: 'empty' });

    const unknown = { strengths: [{ category_id: 'not-a-real-id', heading: 'H', body: 'B' }] };
    expect(gateSection('s5', unknown, ctx)).toEqual({ family: 'category coverage', detail: 'unknown: not-a-real-id' });

    const dupe = { strengths: [goodS5.strengths[0]!, goodS5.strengths[0]!, goodS5.strengths[2]!] };
    const d = gateSection('s5', dupe, ctx);
    expect(d?.family).toBe('category coverage');
    expect(d?.detail).toBe(`duplicate: ${goodS5.strengths[0]!.category_id}`);

    const short = { strengths: goodS5.strengths.slice(0, 2) };
    const m = gateSection('s5', short, ctx);
    expect(m?.family).toBe('category coverage');
    expect(m?.detail).toBe(`missing: ${goodS5.strengths[2]!.category_id}`);
  });

  it('truncates an unknown category id to 24 characters', () => {
    const long = { strengths: [{ category_id: 'z'.repeat(80), heading: 'H', body: 'B' }] };
    const f = gateSection('s5', long, ctx);
    expect(f?.detail).toBe(`unknown: ${'z'.repeat(24)}`);
    expect(f!.detail.length).toBeLessThan(40);
  });

  it('required mention reports the key, never the resolved value', () => {
    const stripped = { ...goodS2, summary: goodS2.summary.replace(constraintFacts.overall.tier.name, 'fine') };
    const f = gateSection('s2', stripped, ctx);
    expect(f?.family).toBe('required mention');
    expect(f?.detail).toBe('tier_name');
    expect(f!.detail).not.toContain(constraintFacts.overall.tier.name);
  });

  it('banned phrase reports the matched phrase', () => {
    const f = gateSection('s2', { ...goodS2, what_this_is_not: 'Every stage is carrying its load.' }, ctx);
    expect(f?.family).toBe('banned phrase');
    expect(f!.detail.length).toBeGreaterThan(0);
    expect(methodology.report.banned_phrases[constraintFacts.archetype].map((p) => p.toLowerCase()))
      .toContain(f!.detail.toLowerCase());
  });

  // THE security assertion of this task. Not "an index is present" — the LABEL IS ABSENT.
  it('anonymity reports the label index and NEVER the label', () => {
    const labels = ['Alice Brown', 'priscilla vandermeer', 'Carol Danvers'];
    const leaked = { ...goodS2, what_this_is_not: 'priscilla vandermeer disagreed.' };
    const f = gateSection('s2', leaked, { ...ctx, labels });
    expect(f?.family).toBe('anonymity');
    expect(f?.detail).toBe('label 1');
    for (const label of labels) expect(f!.detail.toLowerCase()).not.toContain(label.toLowerCase());
  });

  it('field parity and pattern claim carry an empty detail', () => {
    expect(gateSection('s2', { nope: 1 }, ctx)).toEqual({ family: 'field parity', detail: '' });
    expect(gateSection('s2', { ...goodS2, what_this_is_not: '   ' }, ctx)).toEqual({ family: 'field parity', detail: '' });
    const zeroTheology = { ...constraintFacts, pattern_counts: { ...constraintFacts.pattern_counts, systems: 2 } };
    const claim = { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are systems.' };
    expect(gateSection('s7', claim, { ...ctx, facts: zeroTheology })).toEqual({ family: 'pattern claim', detail: '' });
  });

  // Non-vacuity: a gateSection that returned a constant object would pass several asserts above.
  it('still returns null for every good payload', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
    expect(gateSection('s5', goodS5, ctx)).toBeNull();
    expect(gateSection('s6', goodS6, ctx)).toBeNull();
  });
});
```

> **Fixture note:** `goodS2`, `goodS5`, `goodS6`, `ctx`, `constraintFacts` and `methodology` already exist in this file (see its Fixture Construction Kit at lines 1-153). Reuse them; do **not** build new ones. If `goodS5.strengths` is not length 3, adjust the `slice`/index arithmetic above to the real slice size rather than changing the fixture.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/section-gates.test.ts
```

Expected: the new block fails. Most assertions fail with a shape mismatch such as `expected 'field parity' to deeply equal { family: 'field parity', detail: '' }`. **If any new test passes before the implementation, that test is vacuous — fix the test, not the code.**

- [ ] **Step 3a: Change `gateSection`'s signature and every return site**

In `lib/ai/section-gates.ts`, add above `GateContext`:

```ts
/**
 * The eight gate families. A NAMED UNION, not a widened string: adding a family here is a
 * compile error in correctiveInstruction's exhaustive switch, so a new family cannot silently
 * default to "re-roll blind".
 */
export type GateFamily =
  | 'field parity' | 'category coverage' | 'numeric containment'
  | 'required mention' | 'banned phrase' | 'anonymity'
  | 'pattern claim' | 'length ceiling';

/**
 * `detail` is a SECURITY BOUNDARY, not a log format (spec §4.1). The rule at sections.ts:144-147
 * holds: reasons only — never the payload, the parsed output, section text, or the facts pack.
 * In particular `anonymity` carries the label's INDEX and never the label: a respondent label is
 * PII, and logging it would defeat the gate it belongs to.
 */
export interface GateFailure { family: GateFamily; detail: string }

const fail = (family: GateFamily, detail = ''): GateFailure => ({ family, detail });

/** An unknown category id is MODEL OUTPUT, unlike every other detail we emit. Cap it so a model
 *  that returns a sentence in that field cannot turn a reason line into a payload leak. */
const MAX_ECHOED_ID = 24;
```

Change the signature at line 50:

```ts
export function gateSection(id: AiSectionId, parsed: unknown, ctx: GateContext): GateFailure | null {
```

Then each return site, in file order — **the surrounding comments stay exactly as they are**:

```ts
  if (!check.success) return fail('field parity');
  const strings = allStrings(check.data);
  if (strings.some((s) => s.trim().length === 0)) return fail('field parity');
```

Category coverage — the combined `||` at line 79 splits into two so the detail can distinguish them. Behaviour is identical; the order of the two checks preserves today's precedence (unknown wins over duplicate):

```ts
  const coverageField = COVERAGE_FIELD[id];
  if (coverageField) {
    const entries = (check.data as Record<string, { category_id: string }[]>)[coverageField] ?? [];
    if (entries.length === 0) return fail('category coverage', 'empty');
    const known = new Set(
      (SECTION_REGISTRY[id].slice(ctx.facts) as { categories: CategoryFact[] }).categories.map((c) => c.id),
    );
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!known.has(entry.category_id)) {
        return fail('category coverage', `unknown: ${entry.category_id.slice(0, MAX_ECHOED_ID)}`);
      }
      if (seen.has(entry.category_id)) return fail('category coverage', `duplicate: ${entry.category_id}`);
      seen.add(entry.category_id);
    }
    if (seen.size !== known.size) {
      const missing = [...known].filter((k) => !seen.has(k));
      return fail('category coverage', `missing: ${missing.join(', ')}`);
    }
  }
```

Numeric containment:

```ts
  for (const n of extractNumbers(text)) if (!allowed.has(n)) return fail('numeric containment', String(n));
```

Required mention — both branches. The second is the archetype-specific primary-constraint check; it reports the `RequiredMention` key `primary_name` so the detail vocabulary stays closed:

```ts
    if (!lower.includes(needle.toLowerCase())) return fail('required mention', key);
```
```ts
    if (!lower.includes(ctx.facts.primary_constraint.name.toLowerCase())) return fail('required mention', 'primary_name');
```

Banned phrase — both loops:

```ts
    if (lower.includes(phrase.toLowerCase())) return fail('banned phrase', phrase);
```

Anonymity — index only. The loop becomes indexed:

```ts
  for (const [i, label] of ctx.labels.entries()) {
    if (label && lower.includes(label.toLowerCase())) return fail('anonymity', `label ${i}`);
  }
```

Pattern claim and length ceiling:

```ts
          if ((ctx.facts.pattern_counts[theme as keyof FactsPack['pattern_counts']] ?? 0) > 0) return fail('pattern claim');
```
```ts
  const ceiling = ctx.methodology.report.sections[id].length_ceiling;
  if (text.length > ceiling) return fail('length ceiling', `${text.length}/${ceiling}`);
```

- [ ] **Step 3b: Update the ~40 existing assertions mechanically**

In `tests/ai/section-gates.test.ts`, every `expect(gateSection(...)).toBe('<family>')` becomes `.toMatchObject({ family: '<family>' })`. `.toBeNull()` assertions are unchanged. Do **not** use a blanket regex substitution that also rewrites `.toBeNull()` — check each with `grep -n "toBe('" tests/ai/section-gates.test.ts` afterwards and confirm zero remain.

Line 488's parameterised case keeps its label argument: `expect(gateSection('s6', payload, capacityCtx), field).toMatchObject({ family: 'field parity' })`.

- [ ] **Step 3c: Update `compose.ts` to log `family (detail)`**

`lib/report/compose.ts:51-55`:

```ts
    const failure = gateSection(id, parsed, ctx);
    if (failure !== null) {
      // detail is omitted when empty so a reasonless family does not log a bare "()".
      console.warn(`[report] section ${id}: ${failure.family}${failure.detail ? ` (${failure.detail})` : ''}`);
      return false;
    }
```

Add the import: `import { gateSection, type GateFailure } from '../ai/section-gates';` — `GateFailure` is unused until Task 3, so for this task import only `gateSection` and add the type in Task 3. (An unused type import is a lint/tsc nag on a file that *is* linted.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/section-gates.test.ts tests/report/compose.test.ts
```

Expected: PASS. The existing `expect(joined).toContain('[report] section s6: numeric containment')` at `compose.test.ts:333` still passes — the new format appends ` (37)`, and `toContain` matches a prefix. Confirm that specific test is green rather than assuming it.

- [ ] **Step 5: Typecheck — mandatory, this is the shared boundary**

```bash
cd ~/Desktop/XPG-Church-Assess && npm run typecheck
```

Expected: clean. `npm test` does not typecheck, so a green vitest here proves nothing about the signature change. If anything outside `compose.ts` consumed `gateSection`'s return as a string, this is where it surfaces.

- [ ] **Step 6: Run the whole suite**

```bash
cd ~/Desktop/XPG-Church-Assess && npm test
```

Expected: PASS, with no change to the pre-existing count of failures (there should be none).

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/XPG-Church-Assess && git add lib/ai/section-gates.ts lib/report/compose.ts tests/ai/section-gates.test.ts && git commit -m "Return a typed GateFailure so a rejection can be measured

gateSection returned a bare family name, which cannot drive calibration or a
corrective retry. It now returns { family, detail }, and compose.ts logs both.

detail is a security boundary, not a format: anonymity carries the label's
index and never the label."
```

- [ ] **Step 8: Collect the evidence Task 4 is conditional on**

Recreate the live probe from **Appendix A**, run it **3 times**, and record for each run: the AI count out of 7, and every `[report] section <id>: <family> (<detail>)` line. Then **delete the probe file**.

Write the results into `docs/superpowers/plans/2026-08-17-2a-measurements.md` under a `## Baseline (post-Task-1 instrumentation)` heading. Task 4 and Task 5 both read this file. **Do not proceed to Task 2 without it** — Task 4 is explicitly gated on this evidence, and re-running it later costs a live spend that a fresh session cannot reconstruct.

Specifically answer, in that file:
1. Does `s12`'s `numeric containment` detail show `30`, `60`, or `90`? (→ Task 4a)
2. Does `s2`'s `anonymity` detail appear at all, and at which label index? Cross-reference that index against the run's label list **privately** — record only "the label at index N is an ordinary English word: yes/no" and "`profile.leadership_history` / `consultant_notes` contain a name: yes/no". **Do not write any label into the file.** (→ Task 4b)
3. What is the wall-clock duration of the slowest *successful* section call? (→ Task 5)

---

### Task 2: Tell the model its length budget (spec §4.2)

**Files:**
- Modify: `lib/ai/sections.ts` (new pure exports + the system prompt at line 163)
- Test: `tests/ai/budget.test.ts` (create)
- Test: `tests/report/compose.test.ts` (attempt-1 prompt assertion)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  export function wordBudget(lengthCeiling: number): number;   // floor(ceiling / 7)
  export function budgetSentence(lengthCeiling: number): string;
  ```
  Task 3's `length ceiling` corrective calls `wordBudget`.

**Why words, and why 7:** models count words far better than characters, but the gate enforces characters. English prose averages a little under 6 characters per word including the trailing space, so dividing by **7** builds in roughly 15% headroom — a section that obeys the stated word budget lands comfortably under the character ceiling rather than at it. The arithmetic lives in code, not `report.yaml`: that file is copy Natalie edits, and a budget that must stay consistent with a compiler-checked ceiling is not copy.

- [ ] **Step 1: Write the failing test**

Create `tests/ai/budget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wordBudget, budgetSentence, SECTION_REGISTRY, AI_SECTION_IDS } from '../../lib/ai/sections';
import { loadMethodology } from '../../lib/methodology/load';

describe('wordBudget (spec §4.2)', () => {
  it('matches the spec worked examples', () => {
    expect(wordBudget(900)).toBe(128);   // s12
    expect(wordBudget(1400)).toBe(200);  // s2
    expect(wordBudget(6000)).toBe(857);  // s6
  });

  it('floors rather than rounds, so the budget never exceeds ceiling/7', () => {
    expect(wordBudget(2200)).toBe(314);  // s5: 314.28 -> 314
    expect(wordBudget(1)).toBe(0);
  });

  // The margin is the whole point: obeying the word budget must land UNDER the char ceiling.
  it('leaves headroom at 6 characters per word for every real AI section', () => {
    const methodology = loadMethodology();
    for (const id of AI_SECTION_IDS) {
      const ceiling = methodology.report.sections[id].length_ceiling;
      const worstCaseChars = wordBudget(ceiling) * 6;
      expect(worstCaseChars, id).toBeLessThan(ceiling);
      expect(worstCaseChars / ceiling, id).toBeGreaterThan(0.8); // not so tight it wastes the section
    }
  });
});

describe('budgetSentence', () => {
  it('states the word budget in words', () => {
    expect(budgetSentence(1400)).toContain('200');
    expect(budgetSentence(1400).toLowerCase()).toContain('word');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/budget.test.ts
```

Expected: FAIL — `wordBudget is not a function` / import error.

- [ ] **Step 3: Implement**

In `lib/ai/sections.ts`, add just above `composeSection`:

```ts
/**
 * The model's stated budget, in WORDS, derived from the character ceiling the gate enforces
 * (spec §4.2). Models count words far better than characters. Dividing by 7 rather than ~6
 * builds in roughly 15% headroom, so a section that obeys the stated budget lands comfortably
 * under `length_ceiling` instead of at it.
 *
 * This is code, not copy: report.yaml carries what Natalie edits, and a budget that must stay
 * consistent with a compiler-checked ceiling is not copy.
 */
export function wordBudget(lengthCeiling: number): number {
  return Math.floor(lengthCeiling / 7);
}

export function budgetSentence(lengthCeiling: number): string {
  return `Keep your entire response under ${wordBudget(lengthCeiling)} words in total, counting every field.`;
}
```

Then change the system message at line 163:

```ts
          { role: 'system', content: `${methodology.report.style_spine}\n\n${copy.templates[facts.archetype]}\n\n${budgetSentence(copy.length_ceiling)}` },
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/budget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Assert the budget line actually reaches the model**

The unit test above proves arithmetic, not wiring. Add to `tests/ai/sections.test.ts` (which already mocks the OpenAI SDK — read its existing mock setup and follow it exactly rather than inventing a second idiom):

```ts
it('sends the length budget in the system prompt (spec §4.2)', async () => {
  mockParse.mockReset();
  mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
  await composeSection('s12', constraintFacts, methodology);
  const call = mockParse.mock.calls[0]![0];
  const system = call.input.filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content).join('\n');
  expect(system).toContain('128 words');           // s12's ceiling is 900
  expect(system).toContain(methodology.report.style_spine); // the spine is still there
});

it('derives the budget per section, not once globally', async () => {
  mockParse.mockReset();
  mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
  await composeSection('s2', constraintFacts, methodology);
  const call = mockParse.mock.calls[0]![0];
  const system = call.input.filter((m: { role: string }) => m.role === 'system')
    .map((m: { content: string }) => m.content).join('\n');
  expect(system).toContain('200 words');  // s2's ceiling is 1400
  expect(system).not.toContain('128 words');
});
```

> This uses the file's **existing** hoisted `mockParse` idiom (`tests/ai/sections.test.ts:6-16`),
> which that file's own comment marks as the source of truth — `mockParse.mockResolvedValue(...)`
> to configure, `mockParse.mock.calls[0]![0]` to assert. Do not invent a second idiom.
> `constraintFacts` and `methodology` already exist in that file; reuse them.

- [ ] **Step 6: Typecheck and full suite**

```bash
cd ~/Desktop/XPG-Church-Assess && npm run typecheck && npm test
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/XPG-Church-Assess && git add lib/ai/sections.ts tests/ai/budget.test.ts tests/ai/sections.test.ts && git commit -m "Tell the model the length budget it is judged against

The ceiling was enforced only after the fact at section-gates.ts, and the
prompt never mentioned it. Three of seven sections died on length.

Stated in words against a limit enforced in characters, with ~15% headroom."
```

---

### Task 3: Make the existing re-attempt corrective (spec §4.3)

`compose.ts:74` already re-attempts every failed section once, blind. For any deterministic-ish rejection (too long, wrong number, missing category) it re-rolls into the same wall. This task hands the second attempt the first attempt's `GateFailure`.

**Files:**
- Modify: `lib/ai/section-gates.ts` (add `correctiveInstruction`, `sliceCategoryIds`)
- Modify: `lib/ai/sections.ts` (`composeSection` gains an optional corrective argument)
- Modify: `lib/report/compose.ts` (thread the failure into the re-attempt)
- Test: `tests/ai/corrective.test.ts` (create)
- Test: `tests/report/compose.test.ts` (retry call shape)

**Interfaces:**
- Consumes: `GateFailure`, `GateFamily` (Task 1); `wordBudget` (Task 2).
- Produces:
  ```ts
  export interface CorrectiveContext { lengthCeiling: number; categoryIds: readonly string[] }
  export function correctiveInstruction(f: GateFailure, ctx: CorrectiveContext): string | null;
  export function sliceCategoryIds(id: AiSectionId, facts: FactsPack): readonly string[];
  export async function composeSection(
    id: AiSectionId, facts: FactsPack, methodology: Methodology, corrective?: string | null,
  ): Promise<unknown | null>;
  ```

**The three families that get NO instruction, and why:**
- `anonymity` — feeding the offending label back into a prompt is the single worst possible response to an anonymity hit. Re-roll blind.
- `field parity`, `pattern claim` — no actionable, leak-free correction exists. Re-roll blind.
- Also the `parsed === null` path (timeout / incomplete / unparseable): no gate ran, so there is no failure to correct. Blind re-roll, exactly as today.

- [ ] **Step 1: Write the failing test**

Create `tests/ai/corrective.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { correctiveInstruction, type GateFamily, type GateFailure } from '../../lib/ai/section-gates';

const ctx = { lengthCeiling: 1400, categoryIds: ['gen', 'gov', 'comm'] as const };

const ALL_FAMILIES: readonly GateFamily[] = [
  'field parity', 'category coverage', 'numeric containment', 'required mention',
  'banned phrase', 'anonymity', 'pattern claim', 'length ceiling',
];

describe('correctiveInstruction (spec §4.3)', () => {
  it('length ceiling states the measured overage, the limit, and the word budget', () => {
    const out = correctiveInstruction({ family: 'length ceiling', detail: '1834/1400' }, ctx)!;
    expect(out).toContain('1834');
    expect(out).toContain('1400');
    expect(out).toContain('200');       // wordBudget(1400) — same framing as the first attempt
    expect(out.toLowerCase()).toContain('shorter');
  });

  it('numeric containment forbids numbers absent from the facts', () => {
    const out = correctiveInstruction({ family: 'numeric containment', detail: '37' }, ctx)!;
    expect(out.toLowerCase()).toContain('number');
    expect(out.toLowerCase()).toContain('facts');
  });

  it('category coverage names exactly the required ids', () => {
    const out = correctiveInstruction({ family: 'category coverage', detail: 'missing: comm' }, ctx)!;
    for (const id of ctx.categoryIds) expect(out).toContain(id);
    expect(out.toLowerCase()).toContain('exactly one entry');
  });

  it('required mention and banned phrase echo their detail', () => {
    expect(correctiveInstruction({ family: 'required mention', detail: 'tier_name' }, ctx)!).toContain('tier_name');
    expect(correctiveInstruction({ family: 'banned phrase', detail: 'every stage is strong' }, ctx)!)
      .toContain('every stage is strong');
  });

  // THE security assertion of this task.
  it('returns null for anonymity — the label must never re-enter a prompt', () => {
    expect(correctiveInstruction({ family: 'anonymity', detail: 'label 2' }, ctx)).toBeNull();
  });

  it('returns null for field parity and pattern claim', () => {
    expect(correctiveInstruction({ family: 'field parity', detail: '' }, ctx)).toBeNull();
    expect(correctiveInstruction({ family: 'pattern claim', detail: '' }, ctx)).toBeNull();
  });

  // Exhaustiveness: a family added later must not silently default to "no instruction".
  it('handles every GateFamily explicitly', () => {
    for (const family of ALL_FAMILIES) {
      expect(() => correctiveInstruction({ family, detail: '' } as GateFailure, ctx), family).not.toThrow();
    }
    const corrected = ALL_FAMILIES.filter((family) => correctiveInstruction({ family, detail: 'x/1' }, ctx) !== null);
    expect(corrected.sort()).toEqual(
      ['banned phrase', 'category coverage', 'length ceiling', 'numeric containment', 'required mention'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/corrective.test.ts
```

Expected: FAIL — `correctiveInstruction is not exported`.

- [ ] **Step 3a: Implement the builder in `lib/ai/section-gates.ts`**

Add the import at the top: `import { SECTION_REGISTRY, wordBudget, type AiSectionId } from './sections';` (extend the existing import — do not add a second one).

At the end of the file:

```ts
export interface CorrectiveContext {
  lengthCeiling: number;
  /** This section's own slice ids. Empty for the five sections with no category array. */
  categoryIds: readonly string[];
}

/**
 * The second attempt's extra system instruction (spec §4.3). `null` means RE-ROLL BLIND.
 *
 * The switch is exhaustive over GateFamily on purpose: `family satisfies never` in the default
 * makes a newly-added family a compile error here, so it cannot silently inherit "no
 * instruction" — which for a correctable family would quietly restore the blind retry this
 * task exists to remove.
 */
export function correctiveInstruction(failure: GateFailure, ctx: CorrectiveContext): string | null {
  switch (failure.family) {
    case 'length ceiling': {
      // Characters here, not words alone: by the retry the MEASURED overage is known. Restating
      // the word budget alongside it keeps the corrective consistent with the first attempt's
      // framing (§4.2) rather than switching units mid-conversation.
      const actual = failure.detail.split('/')[0] ?? '';
      return `Your previous response was ${actual} characters. The limit is ${ctx.lengthCeiling} characters, about ${wordBudget(ctx.lengthCeiling)} words. Rewrite it substantially shorter.`;
    }
    case 'numeric containment':
      return 'You used a number that does not appear in the facts. Use only numbers present in the facts you were given.';
    case 'category coverage':
      return `Return exactly one entry for each of these category ids, and no others: ${ctx.categoryIds.join(', ')}.`;
    case 'required mention':
      return `Your response must mention: ${failure.detail}.`;
    case 'banned phrase':
      return `Do not use the phrase: "${failure.detail}".`;
    // Feeding the offending label back into a prompt is the single worst response to an
    // anonymity hit. Blind re-roll, deliberately.
    case 'anonymity':
      return null;
    // No actionable, leak-free correction exists for either.
    case 'field parity':
    case 'pattern claim':
      return null;
    default:
      failure.family satisfies never;
      return null;
  }
}

/** This section's slice category ids, read off the SAME registry slice the coverage gate uses —
 *  re-deriving `categories.slice(0, 3)` / `.slice(3)` here would drift the moment the registry
 *  changes, exactly as the gate's own comment warns. */
export function sliceCategoryIds(id: AiSectionId, facts: FactsPack): readonly string[] {
  if (!COVERAGE_FIELD[id]) return [];
  const slice = SECTION_REGISTRY[id].slice(facts) as { categories?: CategoryFact[] };
  return (slice.categories ?? []).map((c) => c.id);
}
```

- [ ] **Step 3b: Let `composeSection` carry a corrective**

In `lib/ai/sections.ts`, change the signature and the `input` array:

```ts
export async function composeSection(
  id: AiSectionId, facts: FactsPack, methodology: Methodology, corrective?: string | null,
): Promise<unknown | null> {
```

```ts
        input: [
          { role: 'system', content: `${methodology.report.style_spine}\n\n${copy.templates[facts.archetype]}\n\n${budgetSentence(copy.length_ceiling)}` },
          // The re-attempt's correction (spec §4.3). Absent on the first attempt, and absent on
          // any re-attempt whose failure carries no leak-free correction.
          ...(corrective ? [{ role: 'system' as const, content: corrective }] : []),
          { role: 'user', content: `Facts for "${copy.title}" — use no number or name absent from this:\n${JSON.stringify(entry.slice(facts), null, 2)}` },
        ],
```

- [ ] **Step 3c: Thread the failure through `compose.ts`**

Replace the `attempt` closure and the retry block:

```ts
  /** `failure: null` on a call/parse failure — no gate ran, so there is nothing to correct. */
  type AttemptResult = { ok: true } | { ok: false; failure: GateFailure | null };

  const attempt = async (id: AiSectionId, corrective?: string | null): Promise<AttemptResult> => {
    const parsed = await composeSection(id, facts, methodology, corrective); // never throws → null
    if (parsed === null) return { ok: false, failure: null };
    const failure = gateSection(id, parsed, ctx);
    if (failure !== null) {
      console.warn(`[report] section ${id}: ${failure.family}${failure.detail ? ` (${failure.detail})` : ''}`);
      return { ok: false, failure };
    }
    sections[id] = parsed;
    return { ok: true };
  };

  const first = await Promise.allSettled(
    AI_SECTION_IDS.map((id) => attempt(id).then((result) => ({ id, result }))),
  );

  // Carry each failure forward so the re-attempt can correct it instead of re-rolling into the
  // same wall (spec §4.3). A settled-but-rejected promise has no failure to carry: treat it as
  // a call failure, which is what it is.
  const failed = first
    .map((r, i) => {
      const id = AI_SECTION_IDS[i]!;
      if (r.status !== 'fulfilled') return { id, failure: null };
      return r.value.result.ok ? null : { id, failure: r.value.result.failure };
    })
    .filter((x): x is { id: AiSectionId; failure: GateFailure | null } => x !== null);

  if (failed.length > 0) {
    await Promise.allSettled(
      failed.map(({ id, failure }) => {
        const corrective = failure
          ? correctiveInstruction(failure, {
              lengthCeiling: methodology.report.sections[id].length_ceiling,
              categoryIds: sliceCategoryIds(id, facts),
            })
          : null;
        return attempt(id, corrective);
      }),
    );
  }
```

Update the import: `import { gateSection, correctiveInstruction, sliceCategoryIds, type GateFailure } from '../ai/section-gates';`

- [ ] **Step 4: Run it to verify it passes**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/corrective.test.ts
```

Expected: PASS.

- [ ] **Step 5: Prove the wiring end to end**

Add to `tests/report/compose.test.ts`, inside `describe('composeReport')`. `mockComposeSection` is the existing hoisted mock — its 4th argument is the corrective:

```ts
it('sends the corrective instruction on the re-attempt of a length failure', async () => {
  const correctives: unknown[] = [];
  mockComposeSection.mockImplementation((id: AiSectionId, _f, _m, corrective?: string | null) => {
    correctives.push(corrective ?? null);
    if (id !== 's2') return Promise.resolve(good(id));
    // First s2 attempt overshoots the 1400-char ceiling; second is good.
    const attemptNo = correctives.filter((_, i) => i >= 0).length; // see note below
    return Promise.resolve(attemptNo <= AI_SECTION_IDS.length ? overlongS2() : good('s2'));
  });
  const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
  const s2Corrective = correctives[correctives.length - 1] as string;
  expect(s2Corrective).toContain('1400');
  expect(s2Corrective).toContain('200');
  expect(s2Corrective.toLowerCase()).toContain('shorter');
  expect(r.section_sources.s2).toBe('ai');
});

it('sends NO corrective after an anonymity failure, and never the label', async () => {
  const label = 'priscilla vandermeer';
  const correctives: (string | null)[] = [];
  let n = 0;
  mockComposeSection.mockImplementation((id: AiSectionId, _f, _m, corrective?: string | null) => {
    if (id === 's2') { correctives.push(corrective ?? null); n += 1; }
    if (id === 's2' && n === 1) {
      return Promise.resolve({ ...good('s2'), what_this_is_not: `${label} disagreed.` });
    }
    return Promise.resolve(good(id));
  });
  await composeReport({ facts: constraintFacts, methodology, labels: [label] });
  expect(n).toBe(2);                       // it DID re-attempt
  expect(correctives[1]).toBeNull();       // ...blind
  const joined = correctives.map((c) => c ?? '').join(' ');
  expect(joined.toLowerCase()).not.toContain(label);
});

it('sends no corrective when the call itself failed (no gate ran)', async () => {
  const correctives: (string | null)[] = [];
  let n = 0;
  mockComposeSection.mockImplementation((id: AiSectionId, _f, _m, corrective?: string | null) => {
    if (id === 's6') { correctives.push(corrective ?? null); n += 1; if (n === 1) return Promise.resolve(null); }
    return Promise.resolve(good(id));
  });
  await composeReport({ facts: constraintFacts, methodology, labels: [] });
  expect(correctives).toEqual([null, null]);
});

it('sends no corrective on any first attempt', async () => {
  const seen: (string | null)[] = [];
  mockComposeSection.mockImplementation((id: AiSectionId, _f, _m, c?: string | null) => {
    seen.push(c ?? null);
    return Promise.resolve(good(id));
  });
  await composeReport({ facts: constraintFacts, methodology, labels: [] });
  expect(seen).toHaveLength(AI_SECTION_IDS.length);
  expect(seen.every((c) => c === null)).toBe(true);
});
```

> **Helpers to add beside the existing `good()` / `gateFailingS2()` kit in that file:**
> ```ts
> function overlongS2() {
>   const ceiling = methodology.report.sections.s2.length_ceiling;
>   return { ...good('s2') as object, summary: 'x'.repeat(ceiling + 434) } as unknown;
> }
> ```
> `+434` makes the measured overage `1834/1400`, matching the spec's worked example, so the assertion on `'1400'` is not accidentally satisfied by the ceiling appearing twice.
>
> **On the first test's attempt counter:** the sketch above is fragile — replace `attemptNo` with a dedicated `let s2Calls = 0; s2Calls += 1;` incremented only when `id === 's2'`, matching the idiom already used at `compose.test.ts:299-307`. Follow that existing test, not this sketch.

- [ ] **Step 6: Typecheck and full suite**

```bash
cd ~/Desktop/XPG-Church-Assess && npm run typecheck && npm test
```

Expected: both clean. The `satisfies never` in the default branch is the compile-time exhaustiveness guard — if typecheck fails there, a family is unhandled.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/XPG-Church-Assess && git add lib/ai/section-gates.ts lib/ai/sections.ts lib/report/compose.ts tests/ai/corrective.test.ts tests/report/compose.test.ts && git commit -m "Make the existing re-attempt corrective instead of blind

compose.ts already re-attempted every failed section once, with no knowledge
of why the first was rejected — so a deterministic rejection re-rolled into
the same wall. The failure now becomes one extra system instruction.

anonymity, field parity and pattern claim still re-roll blind. Feeding an
offending label back into a prompt is the worst answer to an anonymity hit."
```

---

### Task 4: The two suspected false rejections (spec §4.4) — CONDITIONAL

**Neither sub-task is implemented until Task 1 Step 8's evidence confirms it.** If the evidence says otherwise, that sub-task drops out of 2a and this task records why.

**Files:**
- Read first: `docs/superpowers/plans/2026-08-17-2a-measurements.md`, `lib/report/anonymity.ts` (all of it), `lib/report/facts.ts:95-120`
- Modify (4a, conditional): `lib/ai/section-gates.ts`
- Modify (4b, conditional): `lib/ai/sections.ts` and/or `lib/report/facts.ts`
- Test: `tests/ai/section-gates.test.ts`

**Interfaces:**
- Consumes: `GateFailure` details recorded in Task 1 Step 8.
- Produces: nothing new that later tasks depend on.

- [ ] **Step 1: Read the evidence and decide, in writing**

```bash
cd ~/Desktop/XPG-Church-Assess && cat docs/superpowers/plans/2026-08-17-2a-measurements.md
```

Record the decision in that same file under `## Task 4 decision`:
- **4a applies iff** an `s12` (or any section's) `numeric containment` detail is `30`, `60`, or `90`.
- **4b applies iff** the `s2` anonymity failure's cause is cause (1) — a name present in `profile.leadership_history` or `consultant_notes`.
- **If the cause is (2)** — the display label is an ordinary English word matched as a substring with no word boundary (`anonymity.ts:47`, `section-gates.ts:138`) — **STOP. Do not touch the matcher.** Narrowing a fail-closed security boundary needs its own decision and is explicitly out of 2a scope. Record the finding for 2b and move to Task 5.

- [ ] **Step 2 (4a): Write the failing test — only if 4a applies**

```ts
it('permits the 30/60/90 roadmap horizons in s12 (spec §4.4)', () => {
  // s12 IS a 30/60/90-day roadmap. These are structural constants of exactly the same class as
  // SCALE_DENOMINATOR: report.yaml's template asks for them, and FactsPack carries no literal
  // 30/60/90, so every on-template composition was falsely rejected.
  const s12 = {
    assessment: `${constraintFacts.overall.tier.name} at ${constraintFacts.overall.capacity} out of 100.`,
    overall_percent: constraintFacts.overall.capacity,
    tier_name: constraintFacts.overall.tier.name,
    primary_objective: 'In the first 30 days, name the owner. By 60 days, run it weekly. By 90 days, review it.',
  };
  expect(gateSection('s12', s12, ctx)).toBeNull();
});

it('still rejects a number that is neither in the facts nor structural', () => {
  const s12 = {
    assessment: `${constraintFacts.overall.tier.name} at ${constraintFacts.overall.capacity} out of 100.`,
    overall_percent: constraintFacts.overall.capacity,
    tier_name: constraintFacts.overall.tier.name,
    primary_objective: 'In the first 45 days, name the owner.',
  };
  expect(gateSection('s12', s12, ctx)).toMatchObject({ family: 'numeric containment', detail: '45' });
});

it('does not extend the roadmap horizons to other sections', () => {
  const withThirty = { ...goodS2, summary: `${goodS2.summary} Thirty is written 30 here.` };
  expect(gateSection('s2', withThirty, ctx)).toMatchObject({ family: 'numeric containment', detail: '30' });
});
```

> Verify the exact `primary_objective` wording against `methodology/report.yaml`'s s12 template before writing it — the point is that a **template-obedient** composition passes.

- [ ] **Step 3 (4a): Implement — only if 4a applies**

In `lib/ai/section-gates.ts`, beside `SCALE_DENOMINATOR`:

```ts
/** Roadmap horizons. s12 IS a 30/60/90-day roadmap — report.yaml's s12 template asks for exactly
 *  those horizons — but FactsPack carries no literal 30/60/90, so every on-template composition
 *  was falsely rejected. Same class as SCALE_DENOMINATOR above, and scoped per-section for the
 *  same reason gate 2 is scoped: a global allowance would let a number migrate between subjects.
 *  This is a correctness fix, not a relaxation. */
const STRUCTURAL_NUMBERS: Partial<Record<AiSectionId, readonly number[]>> = { s12: [30, 60, 90] };
```

and in gate 2:

```ts
  const allowed = new Set([
    SCALE_DENOMINATOR,
    ...(STRUCTURAL_NUMBERS[id] ?? []),
    ...extractNumbers(JSON.stringify(SECTION_REGISTRY[id].slice(ctx.facts))),
  ]);
```

- [ ] **Step 4 (4b): Scrub labels from the slice at source — only if 4b applies**

s2's slice is `head + cover + profile`, and `profile` carries `leadership_history` and `consultant_notes` — admin-authored prose that `lib/report/facts.ts:105` itself calls "a back door around every other anonymity control in the system". If a name is typed there, we hand the model a name and then forbid it from using it.

**Recon before writing any code** (the redaction helper's exact name and signature are not yet established):

```bash
cd ~/Desktop/XPG-Church-Assess && cat -n lib/report/anonymity.ts && sed -n '95,125p;170,185p' lib/report/facts.ts
```

Then implement the fix **at the point where those two fields enter the facts pack**, so every consumer benefits and the slice is not special-cased. The gate stays exactly as it is — defence in depth, not a replacement.

Test it as a pure unit: a label present in `leadership_history` is absent from the built `profile`, and the surrounding prose survives.

- [ ] **Step 5: Run the tests, typecheck, full suite**

```bash
cd ~/Desktop/XPG-Church-Assess && npx vitest run tests/ai/section-gates.test.ts && npm run typecheck && npm test
```

- [ ] **Step 6: Commit — with a message naming the evidence**

```bash
cd ~/Desktop/XPG-Church-Assess && git add -- lib/ai/section-gates.ts tests/ai/section-gates.test.ts docs/superpowers/plans/2026-08-17-2a-measurements.md && git commit -m "Stop rejecting the 30/60/90 horizons s12 is required to state

Confirmed against the post-instrumentation probe: numeric containment fired
on detail '30'. Same class as SCALE_DENOMINATOR — the template asks for the
number and the facts pack cannot carry it. Scoped to s12."
```

> If **neither** sub-task applies, commit only the measurements file with a message recording that Task 4 was correctly a no-op and why.

---

### Task 5: Timeout, retries and `maxDuration` (spec §4.5)

**Deliberately last, and measured.** Sizing the timeout now — against the current failure mix rather than against how long a *compliant* call takes — would bake the bug into the budget.

**Files:**
- Read first: Context7 OpenAI SDK docs; `docs/superpowers/plans/2026-08-17-2a-measurements.md`
- Modify: `lib/ai/sections.ts:168` (`timeout`, `maxRetries`)
- Modify: `app/app/[churchId]/page.tsx` and/or `app/app/[churchId]/diagnosis/page.tsx` (`maxDuration`)

**Interfaces:**
- Consumes: the slowest-successful-call measurement from Task 1 Step 8, re-measured after Tasks 2–4.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Context7 — MANDATORY before touching the call**

This has not been done in any prior session. Look up the current OpenAI Node SDK docs for: `responses.parse`, `zodTextFormat`, structured outputs, and **request-level `timeout` / `maxRetries` semantics** — specifically whether `timeout` is per-attempt or total across retries, and what `maxRetries` retries on. The retry arithmetic in Step 3 is wrong if that assumption is wrong.

Do not change the call before this step is complete.

- [ ] **Step 2: Establish the deployment's real function ceiling — do not guess it**

`maxDuration` is a **route-segment** config: it is exported from a `page.tsx` / `layout.tsx` / `route.ts`, **not** from a `'use server'` actions file. `composeReport`'s two call sites are both inside `app/app/[churchId]/actions.ts` (lines 253 and 396), so the export belongs on the segment(s) that host the Server Actions invoking them.

```bash
cd ~/Desktop/XPG-Church-Assess && GIT_LITERAL_PATHSPECS=1 grep -rn "generate-button\|from './actions'" app/app/\[churchId\]/page.tsx app/app/\[churchId\]/diagnosis/page.tsx
```

Confirm which segment hosts each action, then confirm the plan's actual ceiling. **Ask Natalie for the Vercel plan tier rather than assuming it** — the maximum differs by tier, and a `maxDuration` above the tier ceiling is a deploy-time error, not a silent clamp. Record the confirmed number in the measurements file.

- [ ] **Step 3: Choose the three numbers together**

Worst case is `2 rounds × (timeout × (1 + maxRetries))`, across 7 concurrent calls. That total must fit inside `maxDuration` **with margin**. Write the arithmetic into the measurements file before editing code — e.g. "slowest compliant call measured at Xs → timeout Ys → worst case 2 × Ys = Zs → maxDuration N, margin M".

- [ ] **Step 4: Apply**

`lib/ai/sections.ts:168` — replace the literals and add a comment stating what they were sized against:

```ts
      // Sized against the slowest COMPLIANT call measured after §4.1-§4.4 (see
      // docs/superpowers/plans/2026-08-17-2a-measurements.md), not against the old failure mix.
      // Worst case is 2 rounds x (timeout x (1 + maxRetries)); it must fit inside the route
      // segment's maxDuration with margin.
      { timeout: <chosen>, maxRetries: <chosen> },
```

And on the confirmed segment file(s):

```ts
/** Report generation runs inside a Server Action on this segment: 7 concurrent model calls,
 *  worst case two rounds. Nothing exported maxDuration before, so this ran at the platform
 *  default — well under the real worst case. */
export const maxDuration = <confirmed>;
```

- [ ] **Step 5: Verify**

```bash
cd ~/Desktop/XPG-Church-Assess && npm run typecheck && npm test && npm run build
```

`npm run build` matters here: an invalid `maxDuration` for the route type surfaces at build, not at test.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/XPG-Church-Assess && GIT_LITERAL_PATHSPECS=1 git add -- lib/ai/sections.ts app/app/\[churchId\]/page.tsx docs/superpowers/plans/2026-08-17-2a-measurements.md && git commit -m "Size the model timeout against a compliant call, and set maxDuration

No maxDuration was exported anywhere in the repo, so report generation ran at
the platform default — below the 2x30s worst case. Both numbers now derive
from measured compliant-call latency rather than from the failure mix."
```

---

### Task 6: Final measurement against the §2 metric

**Files:**
- Modify: `docs/superpowers/plans/2026-08-17-2a-measurements.md`
- Conditional: `methodology/report.yaml`

**Success metric (spec §2):** ≥ **6 of 7** AI sections land across **3 consecutive** live `composeReport` runs on the same church, with no intended change to what the sections say.

- [ ] **Step 1: Run the probe 3 consecutive times**

Recreate the probe from **Appendix A**, run it 3 times against the **same church** used for the baseline, record AI-count out of 7 and every `family (detail)` line per run, then **delete the probe file**.

- [ ] **Step 2: Judge against the metric, honestly**

Write `## Final (post-2a)` into the measurements file with all three runs. If the metric is not met, say so plainly and list what still fails — **do not** declare 2a done on 5 of 7.

- [ ] **Step 3: The approach-C trigger (spec §3)**

**If `s6` lands in fewer than 2 of the 3 runs, do approach C before declaring 2a done.** s6 asks for 5 categories × 6 beats = 30 required strings in one call at 8000 max tokens; one call per category fixes the heaviest section structurally. It is a registry-shape change — stop and plan it separately rather than improvising it here.

- [ ] **Step 4: The `report.yaml` version bump — only if a ceiling moved**

```bash
cd ~/Desktop/XPG-Church-Assess && git diff master -- methodology/report.yaml
```

If **any** `length_ceiling` changed, bump `version: "0.3.0"` → `"0.4.0"` at line 8. **This is mandatory if a ceiling moved** — without it `lib/report/report-hash.ts` serves stale cached reports. If the diff is empty, no bump.

- [ ] **Step 5: Verification before completion**

Invoke `superpowers:verification-before-completion`. Evidence before assertions:

```bash
cd ~/Desktop/XPG-Church-Assess && npm run typecheck && npm test && npm run build && git status --short
```

Confirm: no temp probe file remains, `.claude/` is unstaged, nothing is committed to `master`.

- [ ] **Step 6: Commit and request review**

```bash
cd ~/Desktop/XPG-Church-Assess && git add docs/superpowers/plans/2026-08-17-2a-measurements.md && git commit -m "Record the post-2a measurement against the 6-of-7 metric"
```

Then invoke `superpowers:requesting-code-review` over the whole branch diff against `master`.

---

## Appendix A: The live probe harness

Both Task 1 Step 8 and Task 6 Step 1 use this. It is **never committed** — create it, run it, delete it.

**Why it looks like this:** vitest does not load `.env.local`, so the file parses it manually at the top. `PROSE_MODE=ai`, `OPENAI_MODEL_PROSE=gpt-5.1` and `OPENAI_API_KEY` all live there. **Never print, echo, or commit any value read from it.**

**Build it in this order:**

1. Read the exact signatures first — do not guess them:
   ```bash
   cd ~/Desktop/XPG-Church-Assess && grep -n "^export function buildFacts\|^export interface BuildFactsArgs\|^export interface ChurchFacts" lib/report/facts.ts && sed -n '165,185p' lib/report/facts.ts && grep -n "^export function\|^export async function" lib/report/derive.ts
   ```
2. Model the call shape on the **real** production path at `app/app/[churchId]/actions.ts:241-256`, which is the only place all of `diagnose` → `buildFacts` → `composeReport` are wired together correctly.
3. `ChurchFacts` needs **all 13 keys** — `consultant_notes` included — or `putIfSet` throws at `lib/report/facts.ts:176`. This is the single most common way this probe fails.
4. Place it at `tests/tmp-probe.test.ts` (inside the project so imports and `tsconfig` paths resolve), give it a generous per-test timeout (report generation is 7 concurrent model calls), and have it capture `console.warn` / `console.info` so every `[report] section …` line is recorded rather than scrolling past.
5. Run: `npx vitest run tests/tmp-probe.test.ts`
6. **Delete it:** `rm tests/tmp-probe.test.ts` — and confirm with `git status --short` that it is gone before committing anything.

**What to record per run:** AI count out of 7, the `[report] section_sources: …` summary line, and every `[report] section <id>: <family> (<detail>)` line verbatim — **except** that no respondent label is ever written into the measurements file. Anonymity details are indices by construction; keep them that way.
