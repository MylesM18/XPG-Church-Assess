# Design — Phase 2a: make the executive report's AI sections land

**Date:** 2026-08-17 · **Branch:** `feat/ai-generative-diagnosis-prose` (off `master` @ `4b2f1c7`)
**Scope owner ruling (Natalie, 2026-08-17):** Phase 2 is split; **2a is reliability only**. The
corrections-PDF voice and structure are **2b**, a separate pass on a pipe that already works.
The `ReportBlocksSchema` change from handoff v2 (`leadership_question`, reframing
`do_not_work_on`) is **deferred** — it lives in `lib/ai/prose.ts`, which is out of scope.

---

## 1. Problem

`composeReport` runs seven AI sections. Live baseline, two runs on one church with
`PROSE_MODE=ai` and `gpt-5.1`:

| Run | AI sections that landed |
|---|---|
| A | **0 of 7** (60s wall clock) |
| B | **1 of 7** (`s5` only) |

`AI_SECTION_IDS` (`lib/ai/sections.ts:81`) is `s2, s4, s5, s6, s7, s9, s12`. The other five
sections (`s1, s3, s8, s10, s11`) are deterministic **by design** and always report `fallback` —
so the denominator is 7, not 12. Earlier notes describing this as "fallback ×12" overstate it.

Rejection reasons logged across the two runs:

| Reason | Sections |
|---|---|
| `length ceiling` | s2, s7, s12 |
| `request failed: Request timed out.` | s4, s6, s9 |
| `numeric containment` | s12 |
| `anonymity` | s2 |
| `category coverage` | s6 |

Baseline artefact: `BASELINE-report.json` in scratchpad `20579c12-c19d-41b5-8140-2b0f984df4cf`.

### 1.1 What makes this worse than it looks

**A retry already exists and it is blind.** `lib/report/compose.ts:74` re-attempts every failed
section once. The 0-of-7 and 1-of-7 figures are therefore *post-retry*. The second attempt is
handed no knowledge of why the first was rejected, so for any deterministic-ish rejection
(too long, wrong number, missing category) it re-rolls into the same wall. Two rounds × 30s also
accounts for run A's 60s wall clock.

**The model is never told the length limit it is judged against.** The prompt is
`style_spine + per-archetype template` (`sections.ts:163`). The ceiling is enforced only after
the fact at `section-gates.ts:158`, against values in `methodology/report.yaml`
(s12 900 chars, s7 1200, s2 1400). The one section that passed, s5, came in at roughly 2030 of
its 2200 budget.

**Nothing sets `maxDuration`.** No `maxDuration` export exists anywhere in the repo, so report
generation runs at the platform default — well under the current 2 × 30s worst case. This is a
production failure mode independent of the gates.

---

## 2. Goal and non-goals

**Success metric:** ≥ **6 of 7** AI sections land across **3 consecutive** live `composeReport`
runs on the same church, with no intended change to what the sections say.

**Non-goals for 2a:**
- The corrections-PDF voice, headings, band names, or the four-step per-category formula (2b).
- `lib/ai/prose.ts` and `ReportBlocksSchema` (deferred).
- Removing or weakening any gate. **`anonymity` stays fail-closed and its behaviour is
  unchanged.** `numeric containment` and `category coverage` are correctness guards; they are
  corrected only where they demonstrably reject *compliant* output, never relaxed.
- Copy changes beyond numeric `length_ceiling` values, if calibration moves them.

---

## 3. Approach considered and rejected

**B — budget only** (raise timeout, raise `maxRetries`, loosen ceilings). Two-line diff, but it
guesses: it does nothing for `anonymity`, `numeric containment` or `category coverage`, and it
loosens ceilings without evidence that the ceilings are the problem.

**C — decompose s6.** s6 asks for 5 categories × 6 beats = 30 required strings in one call at
8000 max tokens and 30s, and it fails on both timeout and coverage. One call per category would
fix the heaviest section structurally. Deferred, not dismissed: it is a registry-shape change,
and it is only worth paying for if s6 still fails after the changes below. **Trigger:** if s6
lands in fewer than 2 of the 3 measurement runs at the end of 2a, do C before declaring 2a done.

**A — instrument, calibrate, make the existing retry corrective.** Chosen. Below.

---

## 4. Design

### 4.1 Instrument the gate first (no behaviour change)

`gateSection` returns `string | null` — a bare family name, which cannot drive calibration or a
corrective retry. Change the return type to:

```ts
type GateFamily =
  | 'field parity' | 'category coverage' | 'numeric containment'
  | 'required mention' | 'banned phrase' | 'anonymity'
  | 'pattern claim' | 'length ceiling';

interface GateFailure { family: GateFamily; detail: string }
// gateSection(...): GateFailure | null
```

A named union rather than a widened string, so adding a family forces the retry policy in §4.3
to account for it at compile time.

`compose.ts` logs `[report] section <id>: <family> (<detail>)`.

**Detail content, per family — this is a security boundary, not a formatting choice.** The
existing rule (`sections.ts:144-147`) is: reasons only, never the payload, the parsed output,
section text, or the facts pack.

| Family | `detail` |
|---|---|
| `length ceiling` | `"1834/1400"` — actual and limit |
| `numeric containment` | the offending number, e.g. `"90"` |
| `category coverage` | missing/unknown/duplicate category **ids**, e.g. `"missing: comm, sys"` |
| `required mention` | the `RequiredMention` **key**, e.g. `"tier_name"` |
| `banned phrase` | the matched phrase (it is from `report.yaml`, not from the church) |
| `anonymity` | **the label's index only**, e.g. `"label 2"`. Never the label — a respondent label is PII and logging it would defeat the gate it belongs to. |
| `field parity`, `pattern claim` | `""` |

### 4.2 Tell the model its length budget

Append a budget sentence to the system prompt, derived in `sections.ts` from that section's
`length_ceiling`. Stated in **words**, because models count words far better than characters,
against a limit that is enforced in characters.

`words = floor(length_ceiling / 7)`. English prose averages a little under 6 characters per word
including the following space, so dividing by 7 builds in roughly 15% headroom — a section that
obeys the stated word budget lands comfortably under the character ceiling rather than at it.
Worked: s12's 900 → 128 words; s2's 1400 → 200; s6's 6000 → 857.

The arithmetic lives in code, not in `report.yaml`: `report.yaml` is copy that Natalie edits, and
a budget that must stay consistent with a compiler-checked ceiling is not copy.

### 4.3 Make the existing re-attempt corrective

`compose.ts:74` already re-attempts. Thread the first attempt's `GateFailure` into the second
`composeSection` call as one extra system instruction.

| Family | Second-attempt instruction |
|---|---|
| `length ceiling` | "Your previous response was N characters. The limit is M characters, about W words. Rewrite it substantially shorter." — characters here, not words alone: by the retry the *measured* overage is known, and restating the word budget alongside it keeps the corrective consistent with §4.2's first-attempt framing rather than switching units mid-conversation. |
| `numeric containment` | "You used a number that does not appear in the facts. Use only numbers present in the facts you were given." |
| `category coverage` | "Return exactly one entry for each of these category ids, and no others: …" |
| `required mention` | "Your response must mention: …" |
| `banned phrase` | "Do not use the phrase: …" |
| `anonymity` | **none — re-roll blind.** Feeding the offending label back into a prompt is the single worst response to an anonymity hit. |
| `field parity`, `pattern claim` | none — re-roll blind. |

Also applies to the `parsed === null` path (timeout / incomplete / unparseable): no gate
failure exists, so no instruction — blind re-roll, as today.

### 4.4 Two suspected false rejections — conditional on §4.1's evidence

Neither is implemented until instrumentation confirms it. If the evidence says otherwise, they
drop out of 2a.

**s12 `numeric containment`.** Hypothesis: 30/60/90. The product *is* a 30/60/90 roadmap, so
those are structural constants of exactly the same class as the `SCALE_DENOMINATOR = 100`
already documented at `section-gates.ts:40-43` — which exists because `report.yaml` says
"out of 100" while `FactsPack` carries no literal 100, falsely rejecting every on-template
composition. If confirmed, add a named `STRUCTURAL_NUMBERS` set alongside it, with the same
comment discipline. This is a correctness fix, not a relaxation.

**s2 `anonymity`.** Two live causes, and instrumentation distinguishes them:

1. *Label leaked into the slice.* s2's slice is `head + cover + profile`, and `profile` carries
   `leadership_history` and `consultant_notes` — admin-authored prose that `facts.ts:105` itself
   calls "a back door around every other anonymity control in the system". If a name is typed
   there, we hand the model a name and then forbid it from using it. Fix: scrub labels from the
   slice **at source**. The gate stays, as defence in depth.
2. *The label is an ordinary word.* `anonymity.ts:47` and `section-gates.ts:138` both match a
   display label as a case-insensitive substring with **no word boundary**. A short or common
   display label makes correct prose unpassable.

Fix for (1) is in scope. Fix for (2) is **not** a gate change in 2a — narrowing the match is a
change to a fail-closed security boundary and needs its own decision. If (2) is what the
baseline hit, 2a records it and 2b or a separate ticket takes it.

### 4.5 Timeout, retries and `maxDuration` — last, and measured

Set numbers only after §4.1–§4.4 land, so the timeout is sized against how long a *compliant*
call actually takes rather than against the current failure mix. Three values move together:

- `timeout` (currently 30000) and `maxRetries` (currently 0) in `sections.ts:168`.
- An explicit `maxDuration` export on the route/action that reaches `composeReport`. The chosen
  total must fit inside it with margin: worst case is `2 rounds × (timeout × (1 + maxRetries))`,
  across 7 concurrent calls.

**Verify before choosing:** the deployment's actual function ceiling. Do not guess it.

### 4.6 `report.yaml` version

Bump `0.3.0` → `0.4.0` **only if** calibration moves `length_ceiling` values. The budget
sentence is code, so a code-only 2a needs no bump. If any ceiling changes, the bump is mandatory
or `lib/report/report-hash.ts` serves stale cached reports.

---

## 5. Testing

**Pure unit** (`tests/ai/section-gates.test.ts`):
- One case per `GateFamily` asserting `family` **and** `detail`.
- `anonymity`'s detail is the index and **never contains the label** — assert the label string is
  absent from the detail, not merely that an index is present.
- Existing gate behaviour is unchanged: every currently-passing input still passes, every
  currently-failing input still fails with the same family.

**Pure unit** (new, corrective-instruction builder):
- family → instruction mapping, including that `anonymity`, `field parity` and `pattern claim`
  produce **no** instruction.
- Exhaustiveness over `GateFamily`, so a new family cannot silently default to "no instruction".

**Pure unit** (budget arithmetic): ceiling → word budget, including the margin.

**Mocked SDK** (`tests/report/compose.test.ts` and a sections test):
- First attempt's prompt contains the budget line.
- Second attempt's prompt contains the corrective line for a retryable family.
- Second attempt after an `anonymity` failure contains **no** corrective line and does not
  contain the label.

**Live probe** (temp file, deleted after — vitest does not load `.env.local`, so parse it
manually, then call `diagnose()` → `buildFacts()` → `composeReport()` directly; `ChurchFacts`
needs all 13 keys or `putIfSet` throws at `facts.ts:176`):
- 3 runs before, 3 runs after, recording AI-count out of 7 and every logged family+detail.

**Typecheck:** `npm run typecheck` is mandatory — `gateSection`'s return type is a shared
boundary and `npm test` does not typecheck.

**Known tests that will need deliberate updating:** `tests/ai/section-gates.test.ts` (return
shape), `tests/report/compose.test.ts` (log format, retry call shape). The prose.ts-related
tests listed in handoff v3 are **not** touched in 2a.

---

## 6. Order of work

1. §4.1 instrumentation + its tests. No behaviour change. Run the live probe to collect evidence.
2. §4.2 budget line + tests.
3. §4.3 corrective retry + tests.
4. §4.4 whichever of the two fixes the evidence from step 1 supports.
5. §4.5 timeout / retries / `maxDuration`, sized against measurements.
6. Final 3-run measurement against the §2 metric. If s6 lands in < 2 of 3, do approach C.

---

## 7. Constraints carried in

⛔ Never `npm run test:db`, `supabase db push`, `supabase db reset` · never push to `master`,
never force-push · never handle the API key · explicit git paths, never stage `.claude/` ·
`GIT_LITERAL_PATHSPECS=1` for `[churchId]`/`[categoryId]` paths · no new dependencies ·
show a plan before implementing.

Use Context7 for current OpenAI SDK docs (`responses.parse`, `zodTextFormat`, structured
outputs, timeout/retry semantics) before changing the call in §4.5.
