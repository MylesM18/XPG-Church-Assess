# Diagnosis Report Reform — Design

**Date:** 2026-07-27
**Status:** Approved (all six sections approved section-by-section during brainstorming)
**Next step:** `superpowers:writing-plans`

---

## 1. Problem

The diagnosis report has two defects, one in the math and one in the narrative.

**The math is unfair.** `scoreCategory()` (`lib/engine/score.ts`) is a flat pooled mean of every individual answer, all items and all people at once. Respondent identity is discarded before it runs. Influence is therefore proportional to how many questions someone answered: a person who completes all 40 carries 40× the weight of someone who answers 1, and nothing discloses this. Partial responses are a normal database state — `saveSelfAnswer` writes one answer at a time and the diagnosis gate never checks that anyone finished.

The failure is not theoretical. In a 5-item category where the pastor answers all five items `6` and an elder answers a single item `1`, the pooled mean is **52** (holding). Counting people rather than answers gives **35** (broken, `thresholds.break: 45`). Same data, different primary constraint, different report.

There is also a genuine bug: `normalize()` keys `perRespondent` on `respondent_label`, which is `coalesce(full_name, email, 'Member')`. Two members with neither name nor email both become `'Member'` and **merge into one respondent**, corrupting `respondent_count`, the dispersion stddev, and the disagreement flag. `get_run_responses` does not return `respondent_user_id`, so the engine structurally cannot disambiguate.

**The narrative is thin.** The report is a single-thread argument: find the constraint, prove it, tell the reader not to touch anything else. Seven of eight areas appear only as a name and a number in `Appendix`. There is zero cross-category relationship logic — the only inter-area structure is the hand-authored `chain` and `enablers.gates` in `rules.yaml`, and nothing reads them against a church's actual scores.

**What is wanted:** a fair multi-respondent scoring model where every response counts equitably, and a far richer report that tells the story across all eight areas — how they behave independently *and* how they depend on each other — while still naming where the chain breaks.

The reference template at `_XPG Church Health Assessment™ (Final).md` (439 lines, Promise City Church) is **reference only**. The final report must be more detailed and more insightful than it.

---

## 2. Scope

Three workstreams. **Only 1 and 2 are designed here.**

1. **Aggregation math** — the fair scoring model.
2. **Report depth + correlation** — the four-layer report.
3. **Free-text capture + ministry role + segment divergence** — deferred, not designed.

Workstream 3 is deferred because free text and ministry role are the same *kind* of change: new respondent-supplied data requiring a migration, an input surface in `answer-form.tsx`, a widened `submit_self_response` contract, `validate.ts` changes, a new strip path in `strip_respondents`, and new AI guardrails. Bundling them is one migration instead of two.

Critically, **no existing run has role data**, so building role segments now yields an empty section for every church already in the database. Person effects, by contrast, compute retroactively on every existing run. The same report section upgrades cleanly from *"someone rates high"* to *"your staff rate high"* when role lands.

Workstreams 1–2 are therefore **purely computational and presentational** apart from one narrow RPC migration: no new input surface, no new privacy surface, no new AI guardrails.

---

## 3. Locked decisions

These were settled during brainstorming and are not to be reopened during implementation.

| # | Decision |
|---|---|
| 1 | Aggregation is a two-way balanced decomposition: `answer = area level + person effect + question effect + noise`. |
| 2 | A respondent counts toward an area only when **all 5** of that area's questions are submitted. |
| 3 | **Throughput** is the single focal number on the cover. Capacity / Gap / Constraint are a supporting line beneath, never a co-headline. |
| 4 | `Throughput = 0.85 × min(chain stages) + 0.15 × mean(chain stages)`. |
| 5 | Enablers count toward Capacity only, never Throughput. An enabler below `thresholds.gate` adds a fourth cover line. |
| 6 | Cross-area relationships are **hybrid**: an authored dependency map always renders; measured annotation only at N ≥ 18, computed on person-effect-removed scores. |
| 7 | Ministry role deferred to workstream 3. Scoring stays one-person-one-vote regardless. |
| 8 | Free-text capture deferred to workstream 3. |
| 9 | Report structure is **four layers**, each area gets a **six-field dossier**, dossiers render **inline** (no accordions). |

### Rationale worth preserving

**Decision 2 is what makes decision 1 easy.** With only fully-covered respondents counted, each area's block is a complete rectangle (R respondents × 5 items, no holes). On a complete rectangle the two-way fit is exact and closed-form — no iteration, no convergence tolerance, no shrinkage. Person-first, item-first, and pooled all yield the identical `μ`, so the ambiguity that made this hard disappears. It also maps onto already-shipped tested code: `classify(answeredCount, total)` in `lib/coverage/coverage.ts:22` returns `'covered'` exactly when `answeredCount === total`. **The rule is "count a person in an area iff their `buildMemberMatrix` cell is already green."**

**Decision 3 avoids an inversion hazard.** A pure gap ratio ranks a uniformly weak church *above* a strong-but-bottlenecked one:

| | Church A | Church B |
|---|---|---|
| 8 areas | flat ~40 | 85, 80, 73, **48**, 92, 82, 78, 74 |
| Capacity (8-area mean) | 40 | 77 |
| Throughput | 38 | 52 |
| Gap as a ratio | **95%** | **68%** |

Throughput is monotone — it rises whenever any area improves. The gap remains the narrative spine ("you are running a 77% church through a 52% pipe") but never the headline number.

**Decision 4 was chosen over harmonic mean and pure chain-minimum.** On the test church `guest 85 · conn 80 · disc 73 · vol 48 · gen 92`:

| | today | fixes **vol** 48→70 | ignores vol, polishes strengths |
|---|---|---|---|
| Chain minimum | 48 | 70 (+22) | 48 (**+0**) |
| Harmonic mean | 72 | 79 (+7) | 77 (**+5**) |
| **0.85·min + 0.15·mean** | **52** | 72 (+20) | 53 (**+1**) |

Harmonic mean pays a church **+5** for polishing strengths while the bottleneck is untouched — contradicting the report's own "don't work on the faded stages yet" (`constraint.ts:45-48`). Pure minimum pays **nothing** for real progress in four of five areas, which is brutal on a 90-day re-take. The blend moves **20:1** in favour of fixing the bottleneck yet still rises whenever anything improves. It needs no special case when nothing is broken, unlike "the primary constraint's score" (null above `thresholds.break`). One-line explanation for the report: *"85% of your throughput is set by your weakest stage; the rest of the chain earns the other 15%."*

The 85/15 split is a documented judgement call and must be pinned with a test.

**Decision 5's accepted cost:** `Gap = Capacity − Throughput` blends bottleneck cost with enabler drag. The rejected alternative — chain-only Capacity — would have made `Gap = 0.85 × (chain mean − weakest stage)` exactly, a cleaner identity, but it drops three of eight areas off the cover.

---

## 4. Aggregation math

### 4.1 The fit

New module `lib/engine/fit.ts`. Per area, take only respondents whose coverage cell is `covered`, forming an R×5 rectangle with no holes, and decompose:

```
μ (area level)      = grand mean of the block
person effect_r     = person r's row mean − μ
question effect_i   = item i's column mean − μ
residual_ri         = y_ri − μ − person_r − question_i
score               = round(μ × 10)
```

Exact, closed-form, roughly ten lines. `Σ person effects = 0` and `Σ question effects = 0` by construction.

**Safety property.** On a complete rectangle, `μ` *is* the pooled mean. When everyone finished, the new score equals `scoreCategory()`'s answer exactly. `tests/engine/helpers.ts` always emits complete categories, so all five E2E fixtures keep their current scores and their current primary constraints. The math diverges from today only where today's model is unfair: partial data.

Residuals are not exported on `AreaFit`. Question effects and person deviations cover everything the report says, so no dead field ships. Tests still derive residuals from the four exported quantities to assert the decomposition identity (§9.3).

### 4.2 Calibration vs. disagreement

Fitting each area independently would let a uniformly generous rater's *style* masquerade as area-specific disagreement. Two derived signals, not one:

```
style_r         = mean of person r's effects across the areas they completed
                  → "rates +1.4 above the room on everything"        [calibration]

deviation_ra    = personEffect_ra − style_r
disagreement_a  = stddev of deviation across people in area a
                  → "they rate everything the same except Volunteers" [real conflict]
```

Both stay closed-form — `style_r` is an average of already-computed per-area effects, not a joint refit.

**This replaces `dispersionFor()`**, which today fires on raw spread and so reports a habitually harsh rater as conflict.

### 4.3 Types

```ts
interface AreaFit {
  category_id: string
  mu: number                                                    // 1..10
  n: number                                                     // complete respondents
  personEffects: Array<{ respondent_id: string; effect: number }>
  questionEffects: Array<{ item_id: string; effect: number }>   // → dossier "Inside it"
  excludedPartial: number                                       // → admin nudge
}

interface Calibration {
  people: Array<{ respondent_id: string; style: number; areasCompleted: number }>
  spread: number   // stddev of style
}
```

`NormalizedCategory` gains `fit: AreaFit`.

### 4.4 The `'Member'` collision fix is a prerequisite

Person effects are meaningless if two respondents merge into one. This is a genuine bug, not a design choice.

- `get_run_responses` must return `respondent_user_id` (a `create or replace` migration, same shape as PR #31's coverage-RPC migration).
- `Response` gains `respondent_id: string`.
- `normalize()` keys on `respondent_id`; `respondent_label` becomes display-only.
- `supabase/tests/11_get_run_responses_test.sql` asserts the new column.

**The owner applies the migration.** The agent never runs `supabase db push` or `npm run test:db`.

### 4.5 The honest cost of the 5-of-5 rule

A partial respondent is **dropped**, not down-weighted. In the worked case above — pastor answers five `6`s, elder answers one item `1` — today's pooled mean is **52**; under this design the elder does not count in that area and it reads **60**. Both sit above `thresholds.break: 45`, so the *state* does not change here; what changes is that a single dissenting answer no longer drags the area by five points.

That dissent must not vanish silently. `excludedPartial` surfaces on the admin dashboard as *"1 person has unfinished answers in Volunteers that aren't counting."* The score gets cleaner; the admin gets told what it cost. `buildMemberMatrix` already knows this information.

### 4.6 Gate change (mandatory)

`app/app/[churchId]/actions.ts:28` currently checks `coverage(rows, categories).coveredCount !== categories.length` — i.e. every *item* has ≥1 response from *anyone*. Under the 5-of-5 rule that is satisfiable while **zero people completed any area**, producing a report with nothing scoreable.

New gate: **every area needs `n ≥ 1`** (at least one fully-covered respondent). `lib/coverage/assessment-cta.ts` gets the same treatment.

### 4.7 Confidence becomes per-area

N now varies by area. Today there is a single `respondent_count` with a penalty only at `=== 1`. Each area prints its own N in the area table and in its dossier. `computeConfidence` keeps its current shape but reads the constraint area's N rather than a global count.

### 4.8 Equal area weighting

Overall must weight areas equally regardless of item count. All eight categories have five items today so this is currently moot, but `CategorySchema` only requires `.min(1)`. The implementation must not assume five.

---

## 5. Headline numbers

New module `lib/engine/throughput.ts`:

```ts
throughput = round(0.85 × min(chainScores) + 0.15 × mean(chainScores))
capacity   = round(mean of all 8 area scores)      // identical to assemble.ts:193 today
gap        = capacity − throughput
```

On the test church: `0.85 × 48 + 0.15 × 75.6 = 52.1 → 52`.

### 5.1 Rename, do not redefine

`overall_score` currently means the 8-area mean and is about to mean throughput. Silently changing what a field means is the dangerous option — every consumer keeps compiling while reading the wrong number.

```ts
interface Diagnosis {
-  overall_score: number
+  throughput: number    // the cover number
+  capacity: number      // 8-area mean — what overall_score used to be
+  gap: number           // capacity − throughput
}
```

Deleting `overall_score` makes the typechecker enumerate every consumer: `VerdictHeader`, `buildReportView`, `lib/report/pdf/document.tsx`, `app/r/[shareToken]`, `lib/ai/fallback.ts`, and the tests.

### 5.2 No new field for the gate line

`gating_conditions` already carries `enabler_id`. `buildReportView` joins it against `categories` for the score. The `⚠ Gated by` line renders only when the list is non-empty.

### 5.3 Cover

```
─────────────────────────────
   OVERALL CHURCH HEALTH

          52%

   Capacity 77  ·  Gap 25 pts
   Constraint: Volunteers
   ⚠ Gated by: Governance (31)     ← only when an enabler < 45
─────────────────────────────
```

When no stage is below `thresholds.break`, `primary_constraint` is null and line 3 reads **`Constraint: none — every stage holding`**, with the existing `verdict_no_constraint` copy below. Throughput needs no special case there.

### 5.4 Stale cached payloads

`diagnoses.payload` is cached JSONB. Every existing row has `overall_score` and no `throughput`, so rendering one through the new components would produce a blank cover and eight empty dossiers.

Bump `methodology_version` to `0.2.0`. The diagnosis page detects the mismatch and shows *"This report predates the current methodology — regenerate to see the new analysis"* with the existing regenerate action, rather than rendering a broken report. One comparison, and it tells the truth.

### 5.5 The constant lives in methodology

`rules.yaml` gains `throughput: { min_weight: 0.85 }` so the split is methodology, not a magic number in code.

---

## 6. Dependency map and measured annotation

### 6.1 Authored map — always renders

New module `lib/engine/dependencies.ts`. `rules.yaml` already implies 13 edges: four sequential from `chain`, nine from `enablers.gates` (`gov` → all five stages, `comm` → `guest`/`conn`, `sys` → `vol`/`disc`). Those derive structurally.

Each edge gains an authored prose statement:

```yaml
dependencies:
  - from: sys
    to: vol
    kind: gate
    statement: "Volunteer capacity is capped by the systems that schedule, track and support it."
```

**The statements are XPG methodology and must be authored or approved by the owner.** The schema and the 13 structural edges ship with the code; the prose is a content task, carried explicitly in the plan. The implementation must not invent church-health claims.

Each edge is read against this church's actual scores — deterministic, works at N=1:

| Upstream | Downstream | Read |
|---|---|---|
| weak | weak | **Load-bearing** — this dependency is active and costing you |
| strong | weak | **Clear** — the dependency isn't the explanation; look elsewhere |
| weak | strong | **At risk** — downstream is running on borrowed time |

This gives the constraint section a real causal sentence: *"Systems (74) gates Volunteers (48). Systems is holding — so systems is not what's capping your volunteers."* The report can now say where **not** to spend, backed by structure.

### 6.2 Measured annotation — N ≥ 18 on the intersection

New module `lib/engine/correlation.ts`. Computed on `deviation_ra` from §4.2, **never on raw area means**. Raw per-person area means correlate ≈ 0.7 across all 28 pairs purely from rater generosity — classic common-method variance, an artifact dressed as a finding.

**The leave-two-out trap.** Because a person's deviations are measured against their own style, they are mechanically constrained to sum toward zero. Someone who completed exactly two areas has `d_a = −d_b` *by construction* — a guaranteed perfect negative correlation that means nothing.

Fix: for each pair `(a,b)`, compute that person's style **excluding areas a and b**. Deviations in a and b are then not mechanically linked. Require ≥4 completed areas per person so the leave-two-out style still rests on at least two areas.

**Multiple comparisons.** With 28 pairs at α = 0.05, roughly 1.4 false positives per run are expected. Handled explicitly:

- The **13 authored edges** are directed hypotheses → tested individually, annotated `confirmed` or `not visible in your data`.
- The **15 non-authored pairs** are exploratory → Benjamini–Hochberg across the 15, *plus* a practical-significance floor of `|r| ≥ 0.5`, and at most the **top 2** reported as `unexpected`.

N ≥ 18 gives roughly 80% power to distinguish r ≈ 0.6 from zero. Like the 85/15 split, this is a documented judgement call.

### 6.3 Reach

Most churches will not reach 18 respondents complete in both areas of a pair, so most reports will render the authored map with **no annotations at all**. That is the intended behaviour, not a degraded one. The authored map is the cake; correlation is the cherry. Contradictions (`unexpected`) are the highest-value output when they do appear.

---

## 7. Report structure

Four layers, ordered by depth of read.

```
LAYER 1 · THE VERDICT              ~1 page, forwardable to a board
  CoverCard          NEW      throughput · capacity · gap · constraint · gated-by
  VerdictHeader      reworked verdict sentence + confidence
  AreaTable          NEW      8 rows — name, score, N, band
  [PDF / Share buttons — screen chrome, unchanged]

LAYER 2 · HOW YOUR SYSTEM BEHAVES  the new insight layer
  ChainWalk          kept     constraint + downstream, as today
  EvidenceReceipt    kept     what the constraint score rests on
  CostSection        kept
  DependencyMap      NEW      13 authored edges, read + annotated
  Calibration        NEW      rating-style spread, unnamed
  Disagreement       reworked deviation-based, replaces raw dispersion
  GatingFlags        kept     enablers below the gate line

LAYER 3 · THE EIGHT AREAS
  AreaDossier ×8     NEW      guest → conn → disc → vol → gen, then gov, comm, sys

LAYER 4 · WHAT TO DO
  NextStep           kept     constraint-first action + the offer
  Appendix           thinner  the dossiers now carry the detail
```

Layer 3's order is **fixed** (chain order, then enablers), never sorted by score, so two assessments 90 days apart are directly comparable side by side.

### 7.1 Two current sections are absorbed, not deleted

`BlindSpots` is per-category belief-vs-evidence → becomes the *Watch for* field of the area it concerns. `GenerositySplit` is specific to `gen` → becomes part of the Generosity dossier. Both gain context by sitting next to their area's score.

### 7.2 The dossier

```
DISCIPLESHIP PATHWAY                              73    ·  N=14
────────────────────────────────────────────────────────────────
Reading        one paragraph — what 73 means for this area
Inside it      question effects: "D3 sits 18 pts below the rest"
Agreement      residual spread after rater style: tight / split
Position       p62 of the benchmark prior
Depends on     Systems (74) gates this · feeds Volunteers (48)
Watch for      belief-vs-evidence gap, or the enabler limit note
```

Identical six fields for every area, no exceptions.

| Field | Source | Works at |
|---|---|---|
| Reading | `score` + `state` + a band template in `copy.yaml` | N=1 |
| Inside it | `fit.questionEffects` — largest-magnitude item | N=1 |
| Agreement | `disagreement_a` from §4.2 | N≥2 |
| Position | `cohort_percentile` — `benchmarkFor()` ships today | N=1 |
| Depends on | edges from `dependencies.ts` touching this area | N=1 |
| Watch for | blind-spot gap · enabler limit · generosity mode | varies |

### 7.3 The enabler blind-spot hole is named, not hidden

`gov`, `comm`, and `sys` are 100% belief items, so `gapFor()` structurally returns `evidence: null` and blind-spot detection is impossible for all three. Their *Watch for* field says so plainly: *"Measured on perception only — there's no countable evidence side to cross-check this against."*

Adding evidence items would mean changing the instrument, which is a different project. Documenting the limit is more insightful than an empty field.

### 7.4 View shape

`ReportView` gains `cover`, `areas`, and `system`, and loses top-level `blindSpot` and `generosityMode`. Because `lib/report/pdf/document.tsx` and `app/r/[shareToken]/page.tsx` both consume `buildReportView`, content and ordering cannot drift — only layout primitives differ.

### 7.5 Privacy

Unchanged from what ships. `pdf` and `shared` strip respondent names. The new Calibration section reports **shape without names on every surface** — *"your leaders' baseline generosity spans 2.8 points"* — per decision 7. The existing screen-only labelled respondent list under Disagreement stays exactly as it ships. No new privacy surface, no new strip path.

### 7.6 Deliberate departure: no generated 30/60/90 roadmap

The reference template has one. This report will not.

A roadmap spanning all eight areas directly contradicts the report's own discipline (*"don't work on the faded stages yet"*), and it would require authored content for every area at every severity band — a content project, not an engineering one. Layer 4 stays constraint-first: what to fix, why it is first, and the offer.

### 7.7 Length

Derived from the template, not targeted. Layers 1+2 run about the length of today's entire report; eight dossiers add roughly the same again; Layer 4 is short. That lands near **2.5–3× the 439-line reference template**. Nothing is padded to reach a number.

### 7.8 Rendering

Dossiers render **fully inline** on screen — no accordions. Collapsing the depth the customer is paying for defeats the point, and PDF/shared cannot collapse anyway, so inline keeps all three surfaces identical.

---

## 8. Code changes

### 8.1 New files

| File | Purpose |
|---|---|
| `lib/engine/fit.ts` | two-way decomposition; **absorbs `score.ts`** — score is now `round(fit.mu × 10)` |
| `lib/engine/disagreement.ts` | replaces `dispersion.ts`; deviation-based, style removed |
| `lib/engine/throughput.ts` | throughput · capacity · gap |
| `lib/engine/dependencies.ts` | 13 authored edges read against scores |
| `lib/engine/correlation.ts` | leave-two-out correlation, BH-corrected |
| `supabase/migrations/<ts>_get_run_responses_add_user_id.sql` | `create or replace`, adds `respondent_user_id` |

### 8.2 Modified files

| File | Change |
|---|---|
| `lib/engine/types.ts` | `Response` +`respondent_id` · `NormalizedCategory` +`fit` · `Diagnosis` −`overall_score` +`throughput`/`capacity`/`gap`/`dependencies`/`calibration` |
| `lib/engine/normalize.ts` | key on `respondent_id` · build the fit · count `excludedPartial` |
| `lib/engine/assemble.ts` | wire fit + throughput + dependencies + correlation; per-area N |
| `lib/report/view.ts` | +`cover`/`areas`/`system`, −`blindSpot`/`generosityMode` |
| `app/app/[churchId]/actions.ts:28` | gate becomes "every area has ≥1 complete respondent" |
| `lib/coverage/assessment-cta.ts` | same treatment |
| `methodology/rules.yaml` | +`throughput.min_weight: 0.85`, +`dependencies[]`, +correlation thresholds |
| `methodology/copy.yaml` | band templates for the dossier fields |
| `lib/report/pdf/document.tsx`, `app/r/[shareToken]/page.tsx` | mirror the new sections |
| `app/app/[churchId]/page.tsx`, member-coverage matrix | surface the `excludedPartial` nudge |

### 8.3 Explicitly untouched

`lib/engine/constraint.ts`, `lib/engine/gap.ts`, and `lib/engine/benchmark.ts` are **not** changed. The chain walk still finds the earliest stage below `thresholds.break`; an enabler still cannot be the primary constraint. The diagnostic logic already in production is not being rewritten.

### 8.4 `report.tsx` gets split

`app/app/[churchId]/diagnosis/report.tsx` is 239 lines today and this roughly triples it. Split into `diagnosis/report/{cover,system,dossier,chain,shared}.tsx` so each file stays focused enough to edit reliably. This is improving code being worked in, not a side refactor.

### 8.5 AI prose stays out of Layer 3

`PROSE_MODE` defaults to `'fallback'` (off), and `passesFactCheck()`'s numeric-containment guardrail was built for a handful of fields. Eight dossiers × six fields is 48 new places for a reworder to drift, and the guardrail would not meaningfully constrain them.

**Dossiers are deterministic-only.** The AI reworder keeps exactly its current scope — verdict, evidence, cost, blind spot, next step — and gains no new surface.

---

## 9. Testing strategy

### 9.1 Regression spine

The five E2E fixtures — `healthy-church`, `leaky-bucket`, `founder-bottleneck`, `broad-but-shallow`, `faithful-remnant` — must keep their **exact scores and primary constraints**, asserted numerically, not merely by constraint identity. Complete data ⇒ `μ` equals the pooled mean ⇒ nothing moves. If any fixture shifts, the fit is wrong.

### 9.2 Close the `helpers.ts` blind spot first

`tests/engine/helpers.ts` has never emitted a partial respondent — which is exactly why this unfairness survived to production. **Task 1 of the plan:** extend the builder to emit partials, write the failing test (pastor answers five `6`s, elder answers one item `1` → today **52**, correct **60**), then fix. The blind spot is retired permanently rather than worked around.

### 9.3 Anti-vacuity: assert structural identities

A test that checks a person-effect field exists survives any wrong implementation. Instead:

```
Σ personEffects === 0                                  (within floating tolerance)
Σ questionEffects === 0
μ + person_r + question_i + residual_ri === y_ri        cell by cell
```

These cannot be satisfied by accident. Same discipline for the dossiers: assert `areas.length === 8` and that every one of the six fields is populated or explicitly marked unavailable. Occurrence-count equality, not presence checks.

### 9.4 Judgement calls pinned by name

- `throughput({guest:85, conn:80, disc:73, vol:48, gen:92}) === 52`
- **monotonicity** — raising any stage never lowers throughput (property test over a grid)
- **bottleneck dominance** — fixing the min moves throughput ~20× more than polishing a strength
- **N gate** — at N=17 no annotations render; at N=18 they do
- **practical floor** — `|r| ≥ 0.5` holds independently of statistical significance

### 9.5 Statistical traps get regression tests

Each of these fails loudly if someone later "simplifies" the fix away.

**Common-method variance.** Construct data where every person has a strong rating style but the eight areas are genuinely independent. Raw area-mean correlation lands ≈ 0.7 on all 28 pairs; the deviation path must return **zero confirmed edges**.

**Leave-two-out.** Respondents completing exactly two areas have `d_a = −d_b` by construction. Assert they are excluded, and that leave-two-out on ≥4-area respondents returns ≈ 0 for independent areas.

**False-positive discipline.** 15 pure-noise non-authored pairs must produce **0** unexpected edges after Benjamini–Hochberg.

### 9.6 Report and audience tests

- Chain-then-enabler ordering is fixed and asserted.
- `pdf` and `shared` carry no respondent names.
- Calibration carries no names on **any** surface.
- A `0.1.0` payload renders the regenerate prompt, never a half-empty report.

### 9.7 Tests requiring semantic change

| Test | Change |
|---|---|
| `tests/engine/score.test.ts` | input type changes; assert `μ` on a rectangle **and** that `μ === pooled mean` when complete |
| `tests/engine/normalize.test.ts` | `respondent_id` keying instead of label |
| `tests/engine/dispersion.test.ts` → `disagreement.test.ts` | `spread ≈ 2.5` assertion changes; the reason must be documented in the test |
| `tests/report/*` | new view shape |
| `supabase/tests/11_get_run_responses_test.sql` | asserts the new column |

### 9.8 Process and gates

`superpowers:test-driven-development` per task, `superpowers:subagent-driven-development` for the build, per-task code review plus a final Opus whole-branch review.

Gates: **typecheck 0 · lint 0 · vitest green.** Baseline is 340 tests; this will add materially to that.

**pgTAP is owner-run.** The agent never runs `npm run test:db`.

---

## 10. Content owned by XPG, not by the implementation

1. **Dependency edge statements** — the prose for all 13 authored edges in `rules.yaml`. The schema and structural edges ship with the code; the claims do not.
2. **Dossier band templates** in `copy.yaml` — the `Reading` field's language per score band.

Both are carried as explicit content tasks in the implementation plan and must be authored or approved by the owner before the relevant tasks close.

---

## 11. Guardrails

- The agent never runs `npm run test:db`, `supabase db push`, or `supabase db reset`. Owner-only.
- The agent never merges, pushes to `master`, or force-pushes without the owner.
- Explicit git paths only; never stage `.claude/`.
- `GIT_LITERAL_PATHSPECS=1` for any path containing `[churchId]` or `[categoryId]`.
- No new dependencies.
- CI "Vercel unstable" / `UNSTABLE` on PRs is a `cornerleague` permissions artifact, not a code failure.
