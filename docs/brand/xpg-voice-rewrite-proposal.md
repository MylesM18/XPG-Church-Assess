# XPG report copy — proposed rewrite (for review)

Every string below is a **proposal**, not yet committed. Nothing has been written to
`methodology/` or `lib/` yet. Read the right-hand column, mark anything you want changed, and I'll
apply the approved set in one pass.

Scope: `methodology/copy.yaml`, `methodology/report.yaml`, `SYSTEM_PROMPT` in `lib/ai/prose.ts`,
plus the "Overall" label on the hero score.

---

## 0. Three decisions I need you to confirm

### D1 — Em-dashes: banned, and the copy now complies

`style_spine` and `SYSTEM_PROMPT` both said "No em-dashes" while `copy.yaml` used them in ~20
places. **I've decided in favour of the ban** and rewritten every em-dash out of the deterministic
copy.

Why the ban rather than lifting it: the report renders through two paths (AI reword and the
deterministic fallback), and today the AI path strips em-dashes while the deterministic path keeps
them. The same church could get two different-textured reports. Banning is also testable — I'll add
a regression test that fails if an em-dash reappears in the copy layer.

If you'd rather keep em-dashes, say so and I'll invert it: drop the line from both prompts and leave
the punctuation alone. It's a one-word change either way, but it has to be one or the other.

### D2 — Tier names stay as they are

The Guide's §18 bands (*Strength to Protect + Multiply / Healthy + Maturing / Potential Growth
Constraint / Strategic Priority*) score **one area at a time**. `rules.yaml`'s tiers (*Healthy &
Ready / Healthy but Stretched / Strained / At Risk*) score **the whole church**. Different axes, so
renaming would make the report claim something it isn't measuring — and the tier ids are load-bearing
in the database, the dashboard and the PDF.

**Proposal: keep both, and document why.** I'd bring the Guide's band *language* into the per-area
reading lines (where it belongs) and leave the whole-church tier names untouched. Flag if you want
them reconciled instead — that's a bigger change and I'd do it separately.

### D3 — The hero label reads "OVERALL"

Rendered above the big number on the cover, in the same small-caps style as "CHURCH HEALTH
ASSESSMENT". The alternative is "OVERALL HEALTH", which would match the wording already on the
in-report verdict block. Say the word and I'll switch it.

---

## 1. `methodology/copy.yaml`

`version: "0.1.0"` → `"0.2.0"` (feeds the report cache key).

### blocks

| Field | Now | Proposed |
|---|---|---|
| `verdict` | "Your primary constraint is {primary_name}. It scored {primary_score} out of 100, below the point where a stage is working. Everything after it in the chain will look weak until this is fixed." | "The data points to {primary_name} as your primary growth constraint. It scored {primary_score} out of 100, under the level where this stage reliably carries what comes after it. Areas further along will likely read weaker than they are until this is strengthened." |
| `verdict_no_constraint` | "Nothing in your chain is broken. Every stage is strong. This is a capacity conversation, not a repair one." | "No single area is limiting the others; every stage is carrying its load. What sits in front of you is a question of capacity." |
| `evidence` | "Here is what that score rests on: {evidence_lines}." | unchanged |
| `blind_spot` | "You rated {bs_name} highly, but the countable side tells a different story. Belief sits at {bs_belief}, the evidence at {bs_evidence}, a gap of {bs_gap} points." | "You rated {bs_name} highly, and the countable side reads differently. Belief sits at {bs_belief}, the evidence at {bs_evidence}, a gap of {bs_gap} points. That distance is worth understanding before acting on either number alone." |
| `cost` | "Left alone, {primary_name} caps everything downstream. Spending on {downstream_list} first raises numbers once and changes nothing." | "Left unaddressed, {primary_name} caps what everything after it can reach. Investing in {downstream_list} first tends to lift a number for a season without changing what produced it." |
| `do_not_work_on` | "Do not work on these yet, they are symptoms of the constraint above: {do_not_list}." | "These are worth leaving for now. They read as symptoms of the constraint above rather than separate problems, and they will likely ease as it is strengthened: {do_not_list}." |
| `next_step` | "Start with {primary_name}. {offer_hook}" | "Start with {primary_name}. Strengthening it is what gives everything after it room to grow. {offer_hook}" |

Fixes audit rows 1, 3, 6 and tone gaps 1, 2, 3, 6.

### inserts

| Field | Now | Proposed |
|---|---|---|
| `gating` | "Before this can hold, address {gating_list}. These are the ground the fix stands on." | "For this to hold, {gating_list} will need strengthening first. These are what the change has to stand on." |
| `dispersion` | "Your leaders do not agree on {disp_name}. Answers ranged across {disp_spread} points. That disagreement is itself the finding." | "Your leaders see {disp_name} differently. Answers ranged across {disp_spread} points. That spread is worth investigating before prescribing anything, because it usually points to uneven experience rather than one shared reality." |
| `benchmark_note` | (unchanged) | unchanged |
| `dependency_note` | (unchanged) | unchanged |

`dispersion` now carries Guide §19 directly: variance is a signal to investigate, not a verdict.

### dossier.reading.stage

| Band | Now | Proposed |
|---|---|---|
| `severe` | "This is not underperforming, it is absent — there is no working version of this to improve yet." | "There is not yet a working version of this to strengthen. This is a build, not a repair." |
| `broken` | "This is below the line where it holds — everything downstream of it is running on what little gets through." | "This sits below the level where it holds consistently. Areas further along are working with only what makes it through here." |
| `watch` | "This works, but not reliably — it holds on a good week and slips on the rest." | "This works, though not yet consistently. It holds on a good week and slips on the rest." |
| `holding` | "This is strong. It is not what is limiting you." | "This is a strength to protect. It is not what is limiting you." |

### dossier.reading.enabler

| Band | Now | Proposed |
|---|---|---|
| `severe` | "This is absent, and it is capping every area that leans on it — none of them can rise above it." | "There is no working version of this yet, and every area leaning on it is capped at that level." |
| `broken` | "This is below the line, and it puts a ceiling on every area it touches at once." | "This sits below the line, and it puts a ceiling on every area it touches at once." |
| `watch` | "This mostly holds, but it is thin enough to give way under any added load." | "This mostly holds, though it is thin enough to give way under added load." |
| `holding` | "This is strong — it is not what is capping anything." | "This is a strength to protect. It is not capping anything." |

Kills the "absent" verdict language (tone gap 1) and puts §27's *Protect* word where a leader
actually reads a strength.

### dossier — the rest

| Field | Proposed |
|---|---|
| `enabler_belief_only` | "Measured on perception only, so there is no countable evidence side to cross-check this against." |
| `calibration_spread` | "Rater style spans {spread} points across your leaders. That is removed before any score you see above." |
| `generosity.breadth` | "Breadth: the people who give are generous, there are just not yet enough of them. This routes upstream to connection." |
| `generosity.depth` | "Depth: most of your people give, but few have been taught why. The opportunity is discipleship around generosity." *(unchanged — already on voice)* |
| `generosity.both` | "Both breadth and depth sit low: few givers, and little teaching behind the giving. Generosity here is a discipleship opportunity before it is a budget one." |
| `agreement.split` | "Split: a spread of {spread} points after removing rater style." |
| `agreement.tight` | "Tight: no significant spread once rater style is removed." |

### dependency_reads

| Key | Proposed |
|---|---|
| `load_bearing` | "{fromName} is weak here too, so this dependency is active and part of what it is costing you." |
| `clear` | "{fromName} is strong, so it is not what is capping your {toName}." |
| `at_risk` | "{toName} is strong for now, but {fromName} is weak beneath it, so that strength is running on borrowed time." |
| `both_strong` | "Both are strong. Nothing to flag here." |

### xpg_read (the S3 dashboard read, one per archetype × tier)

This is where audit rows 2, 4, 5, 7 and 8 live — the same three or four sentences said over and over.
Every line below is now distinct from every other line **and** from the report.yaml templates.

**capacity**

| Tier | Proposed |
|---|---|
| `healthy_ready` | "Every area is carrying its load and the numbers are strong across the board. The most useful question now is not what to strengthen, it is what to build for the season ahead." |
| `healthy_stretched` | "Every area is carrying its load, but the whole system is running near its limit. Adding load before adding capacity is how a healthy church becomes a strained one." |
| `strained` | "No single area has given way, but nothing has much room either. Read this as a whole-system capacity picture rather than a list of separate problems." |
| `at_risk` | "No single area has given way, yet every one of them is running low at once. Treat this as a capacity floor to build up from, not a list of separate problems." |

**constraint**

| Tier | Proposed |
|---|---|
| `healthy_ready` | "One area is capping what an otherwise strong system can reach. Strengthening it is the highest-leverage move available to you this year." |
| `healthy_stretched` | "One area is limiting an otherwise healthy system. That is where the ceiling sits, and lifting it lifts everything after it." |
| `strained` | "One area is limiting the rest, and the system around it has little slack to absorb that. Strengthen the constraint before anything after it gets attention or budget." |
| `at_risk` | "A limiting area sits inside a system that is already low across the board. Work the constraint first, because spreading effort evenly now would move very little." |

**foundation**

| Tier | Proposed |
|---|---|
| `healthy_ready` | "No stage is falling short, but an enabler is capping what the strong areas can reach. Strengthen what holds the weight before adding height." |
| `healthy_stretched` | "Your stages are carrying their load; the enablers beneath them are not yet. Every area leaning on those enablers is capped at their level, whatever its own score says." |
| `strained` | "Nothing has given way outright, but the enablers underneath everything set the ceiling. Work those before the stages, because no stage rises above what supports it." |
| `at_risk` | "The enablers holding up every other area are the binding limit right now. Stage-level gains will be temporary until what supports them is strengthened." |

"The ground" is gone from all four (audit row 8) and replaced with varied, concrete load language.

### beats

**pivot** — em-dashes out, meaning unchanged.

| Band | Proposed |
|---|---|
| `severe` | "It ranks {rank} of eight and sits {delta} points below your strongest three. This is not a gap to close, it is a floor to build." |
| `broken` | "It ranks {rank} of eight, {delta} points below your strongest three, and that distance is the finding." |
| `watch` | "It ranks {rank} of eight, {delta} points behind your strongest three. Close enough to look fine, far enough to matter." |
| `holding` | "It ranks {rank} of eight and trails your strongest three by {delta} points, which is a difference in degree rather than in kind." |

**not_statement** — "weak" → "thin", which is the Guide's own word for capacity that has not yet
thickened. Same directness, no verdict on the people.

| Theme | Proposed |
|---|---|
| `systems` | "What is thin here is process, not conviction. Nobody needs persuading; something needs writing down." |
| `culture` | "What is thin here is habit, not capability. Your people can do this; it is not yet what they do." |
| `theology` | "What is thin here is understanding, not effort. People are working hard without a clear reason why." |
| `relational` | "What is thin here is connection, not competence. The work happens, it just does not happen between people." |

**trajectory**

| Value | Proposed |
|---|---|
| `declining` | "Against a declining trajectory, this is where decline tends to show up first." |
| `plateaued` | "Against a flat trajectory, this is one of the places holding the plateau in place." |
| `growing_steadily` | "Against steady growth, this is the area growth will find first." |
| `growing_rapidly` | "Against rapid growth, this is the area most likely to be overrun before it is ready." |

`s8_below_threshold` — unchanged.

---

## 2. `methodology/report.yaml`

`version: "0.1.0"` → `"0.2.0"`.

### style_spine (rewritten)

> Write as an experienced ministry leader sitting beside a lead pastor, not as a consultant grading
> the church from outside. Plain words, warm but precise. Sentence case. Active voice. No em-dashes.
> No churchy clichés. Name strengths before gaps. State what the data shows plainly and hedge what
> it means: "appears", "suggests", "may" and "likely" attach to the interpretation, never to the
> numbers. Frame gaps as growth constraints, capacity gaps and next steps, never as failure,
> brokenness or blame. Connect what you find to discipleship, stewardship and Kingdom impact without
> collapsing into either "pray more" or "better systems". Never invent a number, a category or a
> finding. If a fact is absent from the facts you were given, do not supply it. Return only the JSON.

### Section titles

| | Now | Proposed | Why |
|---|---|---|---|
| s1 | Church Health Assessment | *unchanged* | |
| s2 | Executive summary | *unchanged* | |
| s3 | Health dashboard | *unchanged* | |
| s4 | What the assessment revealed | **What the data suggests** | §44 — distinguish data from interpretation |
| s5 | Organizational strengths | **Strengths to protect** | §27 Protect |
| s6 | Areas requiring investment | **Areas to strengthen** | §27 Strengthen |
| s7 | Lowest scoring indicators | *unchanged* | pure data, correctly neutral |
| s8 | What leaders are saying | *unchanged* | |
| s9 | Strategic diagnosis | **Strategic direction** | §26's own step name; "diagnosis" is clinical |
| s10 | 30/60/90 roadmap | *unchanged* | |
| s11 | Where XPG can partner | *unchanged* | |
| s12 | Final executive assessment | *unchanged* | executive register is a wanted attribute |
| appendix | Methodology and caveats | *unchanged* | |

§27's third word, **Build**, is already the spine of s10 (`align / build / scale`) — that's why it
isn't a title change.

### Section templates

**s1** — unchanged (all three archetypes).

**s2 — Executive summary**

- capacity: "Overall health sits at {overall_percent} out of 100, which places {church_name} in the {tier_name} band. Every stage is carrying its load, so the strategic question is what to build next rather than what to repair."
- constraint: "Overall health sits at {overall_percent} out of 100, which places {church_name} in the {tier_name} band. The data points to {primary_name} as the area limiting the rest. Strengthening it is what gives the others room to show their true health."
- foundation: "Overall health sits at {overall_percent} out of 100, which places {church_name} in the {tier_name} band. The stages are each doing their part, but the enablers underneath them are not yet ready to carry what is being built on them."

**s3 — Health dashboard** (all three): "The eight areas, strongest first. Overall {overall_percent} out of 100, {tier_name}."

**s4 — What the data suggests**

- capacity: "Capacity. Every stage is working, so what sits in front of you is a growth question."
- constraint: "{primary_name}, at {primary_score} out of 100. This is the area the data points to first."
- foundation: "Foundation. The stages are holding; the enablers underneath them are not yet."

**s5 — Strengths to protect**

- capacity: "Three areas are carrying real weight. Name them and protect them before you change anything."
- constraint: "Protect these first. Three areas are strong, and they are what the rest of the work gets built on."
- foundation: "Three areas are strong. Whatever is limiting you, it is not these, and they are worth protecting deliberately."

**s6 — Areas to strengthen**

- capacity: "Each area below is working and has room to grow. Affirm what holds, then name what is missing."
- constraint: "Each area below sits after {primary_name} on the path or alongside it. Read them with that in mind."
- foundation: "Each area below is leaning on an enabler that is not yet ready. Their scores should be read against that."

**s7** — unchanged. **s8** — unchanged.

**s9 — Strategic direction**

- capacity: "Nothing is capping you. The working model below shows which areas compound into which, so growth investment lands where it multiplies."
- constraint: "{primary_name} is where the data points. The working model below shows what it caps, and why investment further along the path rarely holds."
- foundation: "The enablers below set the ceiling for the stages above them. Until they are strengthened, gains at the stage level tend not to stick."

**s10 — 30/60/90 roadmap**

- capacity: "Ninety days, in three phases: align, build, scale."
- constraint: "Ninety days in three phases. Align, build, scale, with every phase pointed at {primary_name}."
- foundation: "Ninety days in three phases. Align, build and scale, with the enablers going first."

**s11** — unchanged.

**s12 — Final executive assessment**

- capacity: "{church_name} finishes at {overall_percent} out of 100, {tier_name}, with every area carrying its load. The objective for the next ninety days is building the capacity to steward what is coming."
- constraint: "{church_name} finishes at {overall_percent} out of 100, {tier_name}. The objective for the next ninety days is {primary_name}, so the church can faithfully steward where it is being taken next."
- foundation: "{church_name} finishes at {overall_percent} out of 100, {tier_name}. The objective for the next ninety days is strengthening the enablers everything else rests on."

**appendix** — unchanged.

### banned_phrases (must change with the theses)

These stop one archetype's report from reaching for another archetype's framing. The old list was
keyed to the old thesis sentences, so it has to move with them. `banned_phrases.constraint` does
double duty — `section-gates.ts` also uses it to stop any sub-70 report (except a capacity one)
sliding into the consolation register.

```yaml
banned_phrases:
  capacity:
    - "primary growth constraint"
    - "the area limiting the rest"
    - "not yet ready to carry"
    - "set the ceiling for the stages"
  constraint:
    - "every stage is carrying its load"
    - "a question of capacity"
    - "what to build next rather than what to repair"
    - "nothing is capping you"
  foundation:
    - "primary growth constraint"
    - "the area limiting the rest"
    - "every stage is carrying its load"
    - "a question of capacity"
```

I've checked each list against the new templates so no archetype trips its own ban — that's why
s2.foundation says "The stages are each doing their part" rather than "every stage is carrying its
load".

### action_library

Unchanged. Every line is already practical, implementable and in voice.

---

## 3. `lib/ai/prose.ts` — SYSTEM_PROMPT

Kept structurally identical (the "you may not add or invent" preamble and the JSON-shape rule are
load-bearing), with the register paragraph replaced so it matches `style_spine` word for word:

```
You are given a fixed set of facts as a draft report in JSON. You may not add, change, reorder, or
invent any number, category, or verdict. Rewrite only the wording of each field.

Write as an experienced ministry leader sitting beside a lead pastor, not as a consultant grading
the church from outside. Plain words, warm but precise. Sentence case. Active voice. No em-dashes.
No churchy clichés. State what the data shows plainly and hedge what it means: "appears",
"suggests", "may" and "likely" attach to the interpretation, never to the numbers. Frame gaps as
growth constraints, capacity gaps and next steps, never as failure, brokenness or blame. Connect
what you find to discipleship, stewardship and Kingdom impact without collapsing into either "pray
more" or "better systems". If a fact is absent from the struct, do not supply it.

Return the same JSON block shape you were given, the same fields, no fields added or dropped.
Return only the JSON.
```

("Name strengths before gaps" is dropped here only — this prompt rewords fields one at a time and
does not control their order, so the instruction would be unfollowable.)

---

## 4. The "Overall" label

The number Natalie means is the hero on the **cover**, the first thing in the report. Today it is a
bare numeral with the tier caption underneath. (The in-report verdict block already reads
"… · Overall Health"; that one is fine.)

**Approach:** put the label on the shared model, not in the two renderers, so web and PDF cannot
drift.

`lib/report/charts.ts` — `CoverModel` gains one field:

```ts
/** Label rendered with the hero numeral so it reads as the overall score rather than a
 *  section score. Lives on the model, not in either renderer, so web and PDF stay identical. */
scoreLabel: string
```

set to `'Overall'` in `coverModel()`. Both renderers apply `.toUpperCase()`, which is the convention
the verdict-block renderers already use.

- `app/app/[churchId]/diagnosis/report/report-cover.tsx` — a `CAPS_LABEL` line directly above the numeral.
- `lib/report/pdf/document.tsx` — a matching `coverScoreLabel` style mirroring `coverKicker`, in the same position.

Rendered result, both surfaces:

```
OVERALL
72
[tier ladder / band strip]
Healthy but Stretched · 72 of 100
```

---

## 5. What I'll run before proposing a commit

- full `vitest` suite (expect churn in `tests/methodology/report-yaml.test.ts` and `tests/report/`)
- `npx tsc --noEmit`
- a new regression test asserting no em-dash anywhere in the copy layer (D1)

Not touched: `rules.yaml` thresholds and tiers, `action_library`, `questions.yaml`, anything under
`supabase/`. No new dependencies. Nothing pushed to `master`.

---

## 6. Coverage against the audit

| Audit item | Status |
|---|---|
| A1 machine register | fixed — "absent"/"broken"/"failed"/"the chain" gone from the copy layer |
| A2 commanding tone | fixed — `do_not_work_on`, `gating`, s5, s6 |
| A3 dismissive of prior spend | fixed — `blocks.cost`, s9.constraint |
| A4 no Kingdom/discipleship/stewardship vocabulary | fixed — s12, s9, `next_step`, generosity lines, both prompts |
| A5 no Protect/Strengthen/Build spine | fixed — s5/s6 titles + templates, reading `holding` bands; Build already lives in s10 |
| A6 findings asserted as fact | fixed — "the data points to", "likely", "tends to", "suggests" |
| A7 band names vs tiers | **decision D2** — keep both, documented |
| A8 em-dash contradiction | **decision D1** — ban kept, copy complies, test added |
| B1–B10 duplicates | all fixed |
| B11–B12 templated stems | fixed |
| C "Overall" label | §4 above |
