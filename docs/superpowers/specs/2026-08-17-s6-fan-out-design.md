# s6 fan-out — one call per category (approach C)

**Date:** 2026-08-17 · **Branch:** `feat/ai-generative-diagnosis-prose` · **Phase:** 2a (reliability)
**Status:** design approved, not implemented. This document is the spec; the implementation plan
is a separate artefact.

---

## 1. The problem, already measured

Do not re-derive or re-measure this. It costs live paid API calls.

`s6` ("Areas to strengthen") asks one model call for **5 categories × 6 beats = 30 required
non-empty strings**, under a 6000-character ceiling and an 857-word stated budget.

Across three baseline runs the failure was identical every time — a **squeeze, not randomness**:

| | attempt 1 | attempt 2 (corrective) | outcome |
|---|---|---|---|
| run 1 | under-covers the slice | covers it, **8885 / 6000** | fallback |
| run 2 | under-covers the slice | covers it, **6195 / 6000** | fallback |
| run 3 | under-covers the slice | covers it, **6984 / 6000** | fallback |

`s6` is also the slowest call in every run.

### The mechanism, read off source

`gateSection` returns on the **first** failure (`lib/ai/section-gates.ts`), and `composeReport`
allows exactly **one** re-attempt (`lib/report/compose.ts:95-116`). Gate order is
parity → coverage → numeric → required/banned → anonymity → pattern → length.

So s6's single corrective is **always** spent on `category coverage`. Attempt 2 clears coverage
and dies on `length ceiling` — with no attempt left. **The measured length corrective
("Your previous response was N characters… Rewrite it substantially shorter") has never once been
issued for s6.** It is dead code for that section.

### A contributing fact, confirmed this session

`methodology/report.yaml:87` sets `s6.length_ceiling: 6000`. It was added in `fda1eeb`
(2026-08-11), when `S6Schema` carried **three** beats. `e497c40` (2026-08-13) doubled s6 to **six**
beats across schema, slice, gate and both renderers and **did not touch `report.yaml`**. The
ceiling therefore budgeted ~400 chars/beat under the old shape and budgets ~200 chars/beat under
the current one. The measured 1.48× overshoot is consistent with a model writing to the beat count
rather than to the ceiling.

**Ruling (Natalie, 2026-08-17): hold 6000 and split it evenly.** `report.yaml` is not edited and
stays at `0.3.0`. Re-costing the ceiling to 9000 is the documented fallback if the split proves too
tight — see §8 R2 — and requires escalation, not improvisation.

---

## 2. What changes, and what deliberately does not

**s6 remains one section.** What splits is the *call*.

Unchanged, and each one is a tripwire:

- Persisted `sections.s6` shape stays `{ areas: [...] }`. `assembleReport`'s schema
  re-validation (`compose.ts:215`), `S6View` in `lib/report/pdf/document.tsx:179` and in
  `app/app/[churchId]/diagnosis/report/sections.tsx:132` all keep working. **No migration.**
- `AI_SECTION_IDS.length` stays **7** (`tests/ai/sections.test.ts:139`); `section_sources` keeps
  13 keys; `summariseSectionSources` is untouched.
- `methodology/report.yaml` is not edited. Version stays **`0.3.0`**.
- The anonymity gate is unchanged and still fail-closed. It now runs 5× per s6 instead of once —
  strictly more coverage, never less.
- D3's `sliceCategoryIds` tests (`tests/ai/section-gates.test.ts` ~`:651+`) stay green, because the
  no-unit path is byte-identical to today.
- `SECTION_REGISTRY.s6.maxOutputTokens` stays **8000**. It is a cap, not a target, and billing is on
  actual output tokens; lowering it would be an unmeasured behaviour change for no gain.
- Gates are never weakened. Every change below either narrows a gate or leaves it identical.

---

## 3. Architecture

### 3.1 `FAN_OUT` — a third opt-in table

`lib/ai/sections.ts` gains, beside `SECTION_REGISTRY`:

```ts
export interface FanOutEntry {
  /** The unit keys, read off the SECTION slice — never by re-deriving `.slice(3)`. */
  keys: (facts: FactsPack) => readonly string[];
  /** One unit's slice. */
  slice: (facts: FactsPack, key: string) => unknown;
  /** Units back to the section's persisted shape. */
  merge: (parts: readonly unknown[]) => unknown;
}

export const FAN_OUT: Partial<Record<AiSectionId, FanOutEntry>> = { s6: { … } };
```

`Partial<Record<AiSectionId, …>>` is the file's established idiom for "this applies to some
sections" — `COVERAGE_FIELD` and `STRUCTURAL_NUMBERS` in `section-gates.ts` are the same shape. An
entry opts a section in; absence is today's behaviour. **s6 only.** s5 has the same array shape and
could be added later without redesign, but nothing has measured a problem there — do not add it.

### 3.2 The unit slice is defined by subtraction, not by copy

```ts
slice: (f, key) => {
  const base = SECTION_REGISTRY.s6.slice(f) as { categories: CategoryFact[] };
  return { ...base, categories: base.categories.filter((c) => c.id === key) };
}
```

`head`, `blind_spots`, `dispersion`, `top_three`, `bottom_items` and `growth_trajectory` keep
exactly one source and cannot drift from the section slice. **Only `categories` narrows.**
`keys` reads off the same base slice, so the fan-out boundary and the coverage gate's known-id set
are derived from one place — the discipline `sliceCategoryIds` and gate 1b already follow.

Fails closed: a key matching nothing yields an empty `categories`, so the coverage gate's `known`
set is empty and any returned entry fails `unknown:`.

### 3.3 No new schema

A unit reuses `S6Schema` and returns `{ areas: [ one ] }`. Merge is
`{ areas: parts.flatMap((p) => p.areas) }`. Because each part was already gated — parity-checked
against `S6Schema`, coverage-checked to exactly its own id — the merged whole satisfies `S6Schema`
by construction and carries exactly 5 distinct ids in `keys` order, which is
`f.categories.slice(3)` order.

### 3.4 Per-unit gating

```ts
export interface GateUnit { slice: unknown; lengthCeiling: number }
export function gateSection(id, parsed, ctx, unit?: GateUnit): GateFailure | null
```

`unit.slice` replaces the two `SECTION_REGISTRY[id].slice(ctx.facts)` calls (gate 1b's known set,
gate 2's allowed-number set). `unit.lengthCeiling` replaces
`ctx.methodology.report.sections[id].length_ceiling` in gate 6. **`unit` undefined → today's
behaviour, exactly.**

`sliceCategoryIds(id, facts, unit?)` takes the same optional parameter, so a unit's
`category coverage` corrective names **one** id rather than five.

### 3.5 Per-unit ceiling and budget

```ts
export function unitCeiling(sectionCeiling: number, unitCount: number): number {
  return Math.floor(sectionCeiling / unitCount);
}
```

Code, not copy — the same argument `wordBudget` already makes in this file: a budget that must stay
consistent with a compiler-checked ceiling is not copy.

`unitCeiling(6000, 5) = 1200` → `wordBudget(1200) = 171` words per area. That is **identical** to
today's effective per-area budget (857 ÷ 5). Approach C does not tighten the prose budget; it stops
asking for the whole thing in one breath. Attempt 1's prompt additionally states the budget
**per beat** rather than only per section, targeting the observed overshoot directly.

Merged output is ≤ 6000 by construction, so the section ceiling holds without a second gate pass.

### 3.6 `composeSection` and `composeReport`

`composeSection(id, facts, methodology, corrective?, unitKey?)` — with a key it sends the unit
slice in the user message and `budgetSentence(unitCeiling(…))` in the system message; without one
it behaves exactly as today.

`composeReport` stops mapping `AI_SECTION_IDS` directly and maps a derived unit list:

```ts
type CallUnit = { id: AiSectionId; key: string | null }
```

One unit per non-fanned section (`key: null`), one per key for a fanned one. Both rounds — the
initial `Promise.allSettled` and the single re-attempt — operate on **units**. A failing unit
retries **alone**; its four siblings are not re-called.

After both rounds, assembly: a non-fanned id stores its result directly; a fanned id stores
`merge(results)` **only if every unit succeeded**.

### 3.7 Failure semantics — all-or-nothing

If any unit fails both rounds, s6 falls back **entirely**, exactly as today.

Both renderers are `S6Schema.safeParse(ai)` → render every area, or `AiFallback`. There is no
partial concept anywhere in the render path, and inventing one means touching both renderers and
`assembleReport` — beyond this change. Independently: shipping a 3-of-5 s6 would contradict the
completeness rule at `section-gates.ts:150-159` that this branch deliberately hardened.

---

## 4. Cost — against the 4×, as `compose.ts:85-94` requires

That comment names this exact change: *"Any change that adds calls per section (e.g. one call per
category) must be costed against this 4x, not against 1x."* Worst case per section today is
2 app rounds × 2 SDK attempts (`maxRetries: 1`) = 4 live calls.

| | worst case | expected | s6 outcome |
|---|---|---|---|
| today | 7 × 4 = **28** | ~9–14 | **fallback, 3 of 3 runs** |
| approach C | 6 × 4 + 5 × 4 = **44** (1.57×) | ~12–19 | ships |

s6 alone goes from 4 worst-case calls to **20**. Expected s6 cost rises from 2 calls-and-a-fallback
to 5–7 calls that produce a section.

The realistic ceiling is nearer **22** than 44: the SDK's `maxRetries: 1` has no observed claim —
across the measured runs (54/54, then 65/65 bar a single transport abort) every call that was made
returned parsed output — so the realistic multiplier is 2, not 4.

**Latency moves the other way.** Today s6 is two large *serial* calls and the slowest thing in every
run. Under C it is 5 small *parallel* calls, each generating ~1/5 the output, so s6's wall time
should fall and the report's with it — run 3's **74,157 ms** wall is the number this pressures
downward, against the `maxDuration = 300` backstop that is the real timeout (standing finding: the
SDK `timeout` bounds time-to-headers only). Peak round-1 concurrency rises 7 → 11.

---

## 5. Files touched

| File | Change |
|---|---|
| `lib/ai/sections.ts` | `FanOutEntry`, `FAN_OUT`, `unitCeiling`; `composeSection` optional `unitKey` |
| `lib/ai/section-gates.ts` | `GateUnit`; optional 4th param on `gateSection`; optional 3rd on `sliceCategoryIds` |
| `lib/report/compose.ts` | unit expansion, per-unit rounds, per-unit corrective, all-or-nothing merge |
| `tests/ai/sections.test.ts` | FAN_OUT shape, unit slice, merge |
| `tests/ai/section-gates.test.ts` | per-unit gates 1b/2/6 **plus no-unit negative controls** |
| `tests/report/compose.test.ts` | the load-bearing wiring tests (§6) |
| `tests/ai/budget.test.ts` | `unitCeiling` / `budgetSentence` at 1200 |

`methodology/report.yaml`, both renderers, `assembleReport`, and every fallback path are **not**
touched.

---

## 6. Test strategy

TDD per task. **RED must be watched.** Because `unit` is optional and defaults to today's
behaviour, most new gate tests would pass by construction — so RED is watched **by mutation** for
each, using the established method: snapshot the source to the scratchpad, mutate with a `python3`
heredoc, run the targeted vitest file, `cp` back, `diff` to confirm zero residue.

**`tests/ai/sections.test.ts`** — `FAN_OUT.s6.keys` returns the 5 `categories.slice(3)` ids in
order; the unit slice narrows `categories` to one and leaves the other six fields deep-equal to the
section slice; `merge` concatenates in key order and round-trips `S6Schema`.

**`tests/ai/section-gates.test.ts`** — with a unit: gate 1b's known set is the single id, so an
entry for a sibling id fails `unknown:`; gate 2 rejects a sibling category's score; gate 6 measures
against 1200, not 6000. **And the negative control: the identical calls with no unit behave exactly
as today** — this is what keeps D3 honest.

**`tests/report/compose.test.ts`** — load-bearing, using the existing `importOriginal` partial mock
(`composeSection` mocked, **`gateSection` stays REAL**):

1. five unit calls are issued for s6, one per category id;
2. a single failing unit retries **alone** — the other four are not re-called;
3. 4-of-5 → `section_sources.s6 === 'fallback'` and `sections.s6` absent;
4. 5-of-5 → `'ai'`, with 5 areas in slice order;
5. a unit's `category coverage` corrective names **one** id.

Without (1)–(3) the entire call-site wiring could be absent and the unit tests stay green.

**`tests/ai/budget.test.ts`** — `unitCeiling(6000, 5) === 1200`; `budgetSentence(1200)` states 171
words.

---

## 7. Task decomposition

Each task ends with `npm test` **and** `npx tsc --noEmit`. `npm test` does not typecheck, and
`lib/ai/**` is under eslint `globalIgnores`, so a green lint proves nothing there.

- **T1** — `unitCeiling`, `FanOutEntry`, `FAN_OUT.s6`, merge. Pure; no call site changes yet.
- **T2** — `GateUnit`; optional param on `gateSection` and `sliceCategoryIds`. No-unit path proven
  unchanged.
- **T3** — `composeSection` unit-aware slice and budget sentence.
- **T4** — `compose.ts` unit expansion, per-unit retry, all-or-nothing merge.
- **T5** — verification: full suite, `tsc --noEmit`, and `git diff lib/` read line by line against
  this document before committing.

---

## 8. Risks — named, not pre-solved

- **R1 — gate 2 narrows per unit.** The other four s6 categories' scores leave the allowed set, so a
  dossier on one area can no longer quote a sibling's score. A deliberate tightening and arguably a
  correctness fix, but it may raise `numeric containment` rejections on s6 units. Absorbed by the
  retry, which is now free.
- **R2 — 1200 chars/area may still be tight.** Measured natural output is ~1777/area. The bet is the
  per-beat prompt plus the freed length corrective. If it does not hold, the documented fallback is
  re-costing `report.yaml` `s6.length_ceiling` to 9000 (1800/area, preserving the invariant that the
  section ceiling equals the sum of the unit ceilings). **That is an escalation, not an
  improvisation.**
- **R3 — round-1 concurrency rises 7 → 11.** No rate-limit ceiling is known from the measurements.
  Watch it; do not pre-solve it.
- **R4 — new tests pass by construction.** The optional-parameter default is today's behaviour. Every
  new gate assertion must have its RED watched by mutation, or it proves nothing.

---

## 9. Out of scope

Fanning out s5. Changing `maxOutputTokens`. Any renderer, `assembleReport`, fallback-path, or
`report.yaml` edit. The 21,030 ms abort anomaly. Partial-section rendering.
