# Phase 2a — live measurements

Companion to `docs/superpowers/plans/2026-08-17-xpg-report-reliability-2a.md`. Task 4 is
**conditional** on this file and Task 5 reads it. Written by the Appendix A probe.

**No respondent label is written into this file.** Anonymity findings are recorded as indices and
yes/no answers only, exactly as Task 1 Step 8 requires.

---

## Baseline (post-Task-1 instrumentation)

**When:** 2026-08-17 · **Code:** `feat/ai-generative-diagnosis-prose` @ `c1de8ca` (Task 1 Steps 1–7,
typed `GateFailure`; **no** Task 2–5 change in place) · **Model:** `OPENAI_MODEL_PROSE` from
`.env.local` · `PROSE_MODE=ai` · `timeout: 30000`, `maxRetries: 0` (`lib/ai/sections.ts:168`).

**Probe provenance — read this before generalising any number below.** `.env.local` carries no
service-role key and the local Supabase rows are behind RLS, so the probe does **not** read a real
church. It runs the real production wiring — `loadMethodology()` → `answers()`/`diagnose()` →
`knownLabels()` → `buildFacts()` → `composeReport()`, modelled on
`app/app/[churchId]/actions.ts:241-256` — over a **synthetic** run: 5 respondents × all 8
categories, `attendance_band: '100_249'`, `conn` depressed to make the constraint archetype.
`themes` is absent (the production path's `clusterThemes` is a separate model call and was not run).
Everything below is therefore evidence about the **gates and the model's behaviour against them**,
which is what 2a is fixing. The respondent labels are the probe's own five invented full names.

Derived pack, identical across all three runs:
`archetype: constraint · capacity 65 · tier "Growth Constrained" · primary_constraint conn · 5 labels`,
profile carrying all 12 keys including `leadership_history` and `consultant_notes`.

### Run-by-run

Every `[report] section …` line verbatim, in emission order. Seven lines per attempt round; the
second round is the blind re-attempt at `lib/report/compose.ts:75`.

**Run A — AI 0/7 · `composeReport` wall clock 56,456 ms**

```
[report] section s5: length ceiling (2473/2200)
[report] section s2: length ceiling (3246/1400)
[report] section s12: numeric containment (80)
[report] section s6: length ceiling (7162/6000)
[report] section s7: length ceiling (8332/1200)
[report] section s9: numeric containment (1)
[report] section s4: numeric containment (1)
[report] section s5: length ceiling (3037/2200)
[report] section s2: length ceiling (4666/1400)
[report] section s12: numeric containment (60)
[report] section s6: length ceiling (7995/6000)
[report] section s4: numeric containment (1)
[report] section s9: numeric containment (60)
[report] section s7: length ceiling (8758/1200)
[report] section_sources: ai 0/12 · fallback: s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12
```

**Run B — AI 0/7 · `composeReport` wall clock 54,154 ms**

```
[report] section s5: length ceiling (2275/2200)
[report] section s2: length ceiling (4144/1400)
[report] section s12: numeric containment (80)
[report] section s7: length ceiling (5708/1200)
[report] section s6: category coverage (missing: comm, disc, gen, vol)
[report] section s9: numeric containment (1)
[report] section s4: numeric containment (1)
[report] section s5: length ceiling (2600/2200)
[report] section s2: length ceiling (4757/1400)
[report] section s12: numeric containment (60)
[report] section s9: numeric containment (1)
[report] section s6: length ceiling (9761/6000)
[report] section s4: numeric containment (80)
[report] section s7: length ceiling (11979/1200)
[report] section_sources: ai 0/12 · fallback: s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12
```

**Run C — AI 0/7 · `composeReport` wall clock 43,548 ms**

```
[report] section s5: length ceiling (2436/2200)
[report] section s2: length ceiling (4269/1400)
[report] section s6: category coverage (missing: comm, disc, gen, vol)
[report] section s12: numeric containment (60)
[report] section s9: numeric containment (1)
[report] section s7: length ceiling (7095/1200)
[report] section s4: numeric containment (1)
[report] section s5: length ceiling (2578/2200)
[report] section s2: length ceiling (4882/1400)
[report] section s12: numeric containment (80)
[report] section s7: length ceiling (7048/1200)
[report] section s9: numeric containment (1)
[report] section s6: length ceiling (7509/6000)
[report] section s4: numeric containment (1)
[report] section_sources: ai 0/12 · fallback: s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12
```

> The `ai 0/12` in `section_sources` is the summary line's own denominator over **all 13 registered
> sections minus none** — it is not the 2a metric. The metric is the AI-section count, **0 of 7** in
> all three runs, consistent with the pre-instrumentation baseline of 0–1 of 7.

### Aggregate over 42 calls (3 runs × 7 sections × 2 attempt rounds)

| Gate family | Rejections | Sections |
|---|---:|---|
| `length ceiling` | **22** | s2 (6), s5 (6), s6 (4), s7 (6) |
| `numeric containment` | **18** | s4 (6), s9 (6), s12 (6) |
| `category coverage` | **2** | s6 (runs B, C, first round only) |
| `anonymity` | **0** | — |
| `required mention`, `banned phrase`, `field parity`, `pattern claim` | **0** | — |

**42 of 42 calls returned parsed output.** Not one SDK failure, timeout, `incomplete`, or
`no parsed output` in any run. Every single rejection is a gate rejection on well-formed,
schema-valid model output. Nothing here is a transport problem.

`length ceiling` overshoot, actual/ceiling:

| Section | Ceiling | Observed range | Overshoot |
|---|---:|---|---|
| s7 | 1200 | 5,708 – 11,979 | **4.8× – 10.0×** |
| s2 | 1400 | 3,246 – 4,882 | 2.3× – 3.5× |
| s6 | 6000 | 7,162 – 9,761 | 1.19× – 1.63× |
| s5 | 2200 | 2,275 – 3,037 | 1.03× – 1.38× |

s5 is the near-miss the pre-instrumentation baseline already hinted at: its worst run is 38% over,
its best 3% over. It is the section a length budget should rescue first.

---

## The three questions Task 1 Step 8 must answer

### 1. Does s12's `numeric containment` detail show 30, 60 or 90? → **YES — 60, in all three runs.**

s12's six rejections are `60` ×3 and `80` ×3 (never 30, never 90). `60` is a roadmap horizon,
`s12` **is** the 30/60/90 roadmap, and `FactsPack` carries no literal 60 — a template-obedient
composition was rejected for obeying the template.

**→ Task 4a APPLIES.**

**But 4a alone will not make s12 pass, and the plan must not assume it will.** Gate 2 returns on the
**first** offending number (`section-gates.ts`: `for (const n of extractNumbers(text)) if (!allowed.has(n)) return fail(...)`),
so each line names one offender out of an unknown total. `80` appeared in three of the six s12
rejections and is **not** a structural constant — it is the model inventing a number. And because
gate 2 fires before the length gate, s12 has **never yet been measured against its 900-char
ceiling**; that failure may be waiting behind this one. 4a is still correct — it removes a real
false rejection — but expect s12 to need Task 2's budget and Task 3's corrective retry as well.

Two more numeric-containment facts worth carrying into Task 3, neither of which 4a touches:

- **`1` is the single most common offender: 10 of 18** (s9 ×5, s4 ×5). A bare `1` is almost
  certainly enumeration or an idiom ("step 1", "one in three"), not a claim about the church. It is
  *not* proposed as a structural constant here — that is a decision, not a measurement, and 2a's
  scope for gate changes is "only where they demonstrably reject compliant output". Recorded so
  Task 3's corrective instruction can name the actual number back to the model.
- **`80`** also fired once on s4 (run B). Same class as s12's 80: invented, not structural.

### 2. Does s2's `anonymity` detail appear, and at which label index? → **NO. It never fired.**

Zero `anonymity` rejections in 42 calls, on s2 or on any other section.

Required yes/no answers:

- **"The label at index N is an ordinary English word: yes/no"** → **N/A.** No anonymity failure
  occurred in any run, so there is no index to cross-reference. Nothing was looked up.
- **"`profile.leadership_history` / `consultant_notes` contain a name: yes/no"** → **NO.** Both keys
  survived into `facts.profile` in all three runs, which *is* the proof: `lib/report/facts.ts:181-189`
  admits a `FREE_TEXT_PROFILE_KEYS` value **only** when `containsRespondentLabel(value, labels)` is
  false.

**→ Task 4b does NOT apply on this evidence.** It is not a STOP either — the STOP condition is
"the cause is the ordinary-English-word substring match", and there was no failure to have a cause.

**Plan-vs-source note (source governs; recorded, not escalated).** Task 4b's premise is "if a name
is typed there, we hand the model a name and then forbid it from using it." The source already
closes that path in **both** arms of `LabelSource`: under `kind: 'known'` the loop above **omits**
any free-text profile field containing a label, and under `kind: 'redacted'` the free-text keys are
omitted outright (`facts.ts:167-190`). So cause (1) cannot put a collected respondent name into
s2's slice today. Whatever an s2 anonymity failure would be, it would have to be cause (2) — a
label that is a substring of ordinary composed prose, which is precisely the matcher this phase is
forbidden to narrow. Task 4b's Step 1 should record this and move to Task 5.

> Provenance limit, stated plainly: the probe's five labels are invented full names, none of which
> is an ordinary English word standing alone, so this run could not have produced a cause-(2)
> collision either. The finding that *stands* independent of the fixture is the source reading
> above — the gate's own trigger surface. A real roster with a bare-first-name label
> ("Grace", "Hope", "Will") remains an open cause-(2) risk for 2b, and this run is not evidence
> against it.

### 3. Wall clock of the slowest **successful** section call → **29,828 ms** (s4, run A, first round)

No section ever passed its gate, so "successful" is read here as **the SDK call returned parsed
output** — which all 42 did. That is the right quantity for Task 5 anyway: it is how long the model
takes to answer, independent of whether the answer then survives a gate.

| | ms |
|---|---:|
| Slowest call, all runs | **29,828** (s4) |
| Slowest call per run | 29,828 / 27,300 / 22,697 |
| Fastest call | 6,947 (s5) |
| Slowest per section | s4 29,828 · s7 26,847 · s6 25,532 · s9 24,290 · s12 17,060 · s5 8,796 · s2 12,471 |
| `composeReport` total (2 rounds × 7 concurrent) | 56,456 / 54,154 / 43,548 |

**The finding Task 5 has to act on: the slowest observed call is 29,828 ms against a 30,000 ms
timeout — 0.6% of margin.** It did not time out in 42 tries, but s4 is one slow token away from
doing so, and `maxRetries: 0` means a timeout is an immediate fallback with no second chance inside
the call. Note also that today's measurement is of *over-long* output; Tasks 2–4 should make
compliant answers **shorter**, so Task 5 must re-measure rather than size against these numbers.
Both rounds together already run 43.5–56.5 s of wall clock with **no** `maxDuration` exported
anywhere — a real deployment ceiling of 60 s would be inside the observed range today.

---

## Consequences for the remaining tasks

- **Task 2 (length budget) is the highest-value change in the plan, by a wide margin.** 22 of 42
  rejections are length, the model is never told its ceiling, and s7 overshoots by up to **10×**.
- **Task 3 (corrective retry)**: the blind re-attempt is measurably worthless here — round 2 failed
  on the *same family* for the same section in 20 of 21 cases, and frequently overshot **worse**
  (s2 3,246 → 4,666; s6 7,995 → 9,761; s7 8,332 → 8,758). A re-roll without the reason is not a fix.
- **Task 4a**: applies, s12 `60`. **Task 4b**: does not apply — see above.
- **Task 5**: re-measure after 2–4; today's slowest is 29.8 s against a 30 s timeout.

## Task 4 decision

**Task 4b (scrub labels from the s2 slice at source): DROPPED. Not a STOP.** Two independent
reasons, both checked against source rather than against the plan:

1. `anonymity` fired **zero** times across all 42 calls (§"3 questions", Q2 above).
2. Its premise is already false in source. `lib/report/facts.ts:181-189` omits any free-text
   profile field that contains a label, so the leak path 4b exists to close — a respondent name
   typed into `leadership_history` or `consultant_notes` reaching the model in s2's slice — is
   already closed upstream of the gate.

The gate itself is untouched: fail-closed, full-label case-insensitive substring, unnarrowed.
Spec §4.4's "fix for (2) is not a gate change in 2a" still stands and is not revisited.

**Task 4a (structural numbers for s12): STILL APPLIES, justification NOT yet re-derived.**
The measured fact is solid — `60` tripped `numeric containment` on s12 in all three runs — but
the plan's stated rationale ("report.yaml's s12 template asks for exactly those horizons") is
**false as written**: that template says "the next ninety days" in WORDS, not `30`/`60`/`90` in
digits. Re-read s12's schema and template and re-derive before writing the test. Note also that
`80` fires as often as `60` and is *not* structural, gate 2 returns on the FIRST offender only,
and s12 has never yet reached its 900-character length gate — so 4a alone will not make s12 pass.

## Task 5 input, confirmed by the product owner (2026-08-17)

**Vercel plan tier: Pro.** Fluid compute caps `maxDuration` at 800 s (default 300 s). The
measured `composeReport` total was 43.5–56.5 s *before* Tasks 2–4, so the ceiling is not the
binding constraint — re-measure after Task 4 and size from that, not from this number.

## Task 4a — justification re-derived from source, then implemented

The plan's rationale was checked against source and **two of its claims are false**:

1. *"report.yaml's s12 template asks for exactly those horizons"* — **false.** s12
   (`methodology/report.yaml:141-157`) is titled *"Final executive assessment"* and all three
   templates say **"the next ninety days"** in words. No digits appear in them.
2. *"s12 IS a 30/60/90 roadmap"* — **false.** The roadmap is **s10**
   (`report.yaml:124-128`, title `"30/60/90 roadmap"`, templates *"Ninety days, in three phases:
   align, build, scale"*), a deterministic section that is not in `AI_SECTION_IDS`.

An alternative hypothesis for the observed `60`/`80` pair — that they are tier-band boundaries —
was also checked and is **dead**: `methodology/rules.yaml:63-67` puts the bands at 85 / 70 / 55 / 0.

**The justification that does hold.** s12's templates require an objective for *"the next ninety
days"*, and that ninety-day window is the one s10 publishes as its own title. So `90` is s12's
template word written in digits, and `30`/`60` are that published window's phase boundaries.
`FactsPack` carries no literal 30/60/90 — any appearance is a coincidence of one church's scores.
That is the same class as `SCALE_DENOMINATOR`: the report's own structural vocabulary, absent from
the facts pack, falsely rejected by a containment gate scoped to the facts.

**Scope of what was measured.** Only `60` was observed (all three runs). `30` and `90` are admitted
because the three are one published set; admitting one boundary and rejecting the others would be
arbitrary. Recorded as prospective, not measured.

**4a does not make s12 pass on its own** — restated here because the commit is easy to
over-read: `80` fired in three of six s12 rejections and is *not* structural, gate 2 returns on the
first offender only, and s12 has still never been measured against its 900-char length ceiling.
Task 2's budget sentence and Task 3's corrective retry are the other half; Task 6 measures whether
the combination lands.

**Implemented** in `lib/ai/section-gates.ts` as `STRUCTURAL_NUMBERS`, scoped per-section
(`{ s12: [30, 60, 90] }`) and unioned into gate 2's `allowed` set. No gate weakened for any other
section; no `length_ceiling` touched, so `methodology/report.yaml` stays at `0.3.0`.

**Tests** (`tests/ai/section-gates.test.ts`, +5, suite 1541 → 1546). `ctx.facts` could not carry
them: `constraintFacts`'s s12 slice already holds 30 (conn's score) and 60 (`overall.throughput`),
so two of three horizons would have been vacuously allowed. A dedicated `s12Facts` pack keeps all
three out of the slice, and each horizon gets its own test because gate 2 returns on the first
offender. RED was watched: all three failed before the change; the `45` control passed throughout,
which proves the shared scaffold contributed no other offending number.

## Task 5 Step 1 — Context7 on the OpenAI Node SDK (done 2026-08-17)

Context7's Node pages redirect to `/websites/developers_openai`, whose retry/timeout prose is
written against the **Python** reference. So the semantics below were confirmed against the
**installed SDK source** — `node_modules/openai` @ **7.4.0**, the version in `package.json:22` —
which governs. Line numbers are `client.mjs`.

- **`timeout` is PER ATTEMPT, not total across retries.** `makeRequest` rebuilds the request each
  attempt via `buildRequest`, which returns `{ req, url, timeout: options.timeout }` (`:377`,
  `:644`), and `fetchWithTimeout` starts a **fresh** `setTimeout(abort, ms)` per attempt (`:535`).
  `retryRequest` recurses back into `makeRequest(options, retriesRemaining - 1)` (`:607`).
- **A timed-out attempt is itself retried.** The abort surfaces as an error, `isAbortError` matches
  (`:410`), and the request is retried while `retriesRemaining` (`:412-420`). Timeouts are
  therefore **additive**, not capped by the timeout value.
- **`maxRetries` retries on:** connection errors and aborts (`:399-420`), plus any response where
  `shouldRetry` is true (`:557-578`) — `x-should-retry: true`, **408**, **409**, **429**, and
  **>= 500**. 400-class errors other than 408/409 are terminal. Default is 2; ours was 0.
- **The plan's Step 3 formula under-counts.** Between attempts the SDK sleeps
  `min(0.5 x 2^n, 8) s x jitter(0.75-1.0)` (`calculateDefaultRetryTimeoutMillis`, `:609-620`), or
  the server's `retry-after-ms` / `retry-after` header **verbatim** when present (`:580-601`) —
  and OpenAI does send `retry-after` on 429. So the true worst case per section is
  `(1 + maxRetries) x timeout + SUM(backoff)`, and per report that x 2 app-level rounds. The
  server-directed backoff term is the one we cannot bound from our side; bounding `maxRetries`
  bounds how many times we can pay it.
- **`responses.parse` is one HTTP request per attempt** — it is `responses.create(...)
  ._thenUnwrap(parseResponse)` (`resources/responses/responses.mjs:60-64`). No polling loop, no
  second round trip. `zodTextFormat` only builds the `text.format` JSON schema; the parse is
  client-side.

## Task 5 Step 2 — the segments that host `composeReport` (verified in source)

No `maxDuration` is exported **anywhere** in the repo (`grep -rn "maxDuration" app/ lib/
next.config.* vercel.json` is empty), so report generation runs at the platform default.

Two segments reach `composeReport`, and **both** need the export:

1. `app/app/[churchId]/page.tsx` — renders `<GenerateButton>` (`:20`, `:282`), whose
   `generateDiagnosis` action reaches `composeReport` at `actions.ts:253`.
2. `app/app/[churchId]/diagnosis/page.tsx` — hosts `<form action={regenerateReport}>` (`:245`)
   reaching `composeReport` at `actions.ts:396`, **and** renders `EmptyState` /
   `StaleMethodologyNotice` from `./report/shared` (`:23`), which itself renders `GenerateButton`.

`app/r/[shareToken]/page.tsx` is **excluded**: it imports `SharedStaleMethodologyNotice` only and
composes via `assembleFallbackOnly` — it never calls `composeReport`.

## Task 5 latency probe — post-Tasks-2-4, pre-Task-5 (2026-08-17)

One Appendix-A probe run at `5b2aef5`, still on the **old** `{ timeout: 30000, maxRetries: 0 }`.
Same synthetic church shape as the baseline — 5 respondents x 8 categories, `attendance_band
'100_249'`, `conn` depressed — reproduced to the baseline's recorded invariants: **archetype
`constraint`, capacity 65, tier `strained` ("Growth Constrained"), `primary_constraint` conn,
5 labels, 12 profile keys**. The per-item answer values from the baseline probe were not recorded
anywhere and are not recoverable, so the derived pack matches on those invariants but not
necessarily item-for-item; category scores this run were
`gen 80 · comm 70 · guest 70 · vol 70 · gov 68 · disc 64 · sys 64 · conn 34`.

**Result: AI 5/7 · `composeReport` wall clock 42,722 ms · 12 of 12 calls returned parsed output.**
(Baseline was 0/7 at 54.2-56.5 s.) Gate lines verbatim, in emission order:

```
[report] section s4: numeric containment (60)
[report] section s12: required mention (overall_percent)
[report] section s2: length ceiling (1612/1400)
[report] section s9: length ceiling (2351/2000)
[report] section s6: category coverage (unknown: comm)
[report] section s2: length ceiling (1507/1400)
[report] section s6: length ceiling (6987/6000)
[report] section_sources: ai 5/12 · fallback: s1, s2, s3, s6, s8, s10, s11
```

Sources: `s2 fallback · s4 ai · s5 ai · s6 fallback · s7 ai · s9 ai · s12 ai`. **Only s2 and s6
fail.** Every round-1 failure except s2's and s6's was corrected on the re-attempt — Task 3's
corrective retry is visibly working (s4, s9, s12 all recovered).

**Per-call latency, ms** (round 1 then round 2; `!` would mark an unparsed call, none occurred):

```
s7=5241 s4=6130 s12=7331 s2=7597 s5=7610 s9=7840 s6=19158
s2=4626 s4=4652 s12=7560 s9=7866 s6=23556
```

**Slowest call 23,556 ms** (s6, round 2) against the 30,000 ms timeout — **only 21% headroom**,
and s6 is structurally the slow one (5 categories x 6 beats = 30 required strings at 8000 max
tokens). Slowest *gate-passing* call was 7,866 ms; sizing off that would be wrong, because s6 will
still take ~20 s on the day it starts passing. Size against the slowest **well-formed** call.

### The three numbers, derived

- Slowest observed call **23.6 s** → **`timeout: 45_000`** (1.9x headroom over the worst observed,
  2.3x over the worst-but-one).
- **`maxRetries: 1`**. 54 of 54 live calls across the baseline and this run returned parsed output,
  so retries are insurance against 429/5xx under 7-way concurrency, not a measured need. Each extra
  retry multiplies the per-call ceiling **and** buys another server-directed `retry-after` sleep of
  unbounded length, so one is the defensible number.
- Worst case per section = `(1 + 1) x 45 s + backoff(~0.5 s)` = **90.5 s**; x 2 app-level rounds =
  **181 s**. The 7 section calls run concurrently, so that is also the report's worst case.
- **`maxDuration = 300`** on both segments — the Vercel **Pro** fluid-compute default (ceiling
  800 s), so no plan-tier risk. Margin over the 181 s worst case: **119 s (39%)**.

No `length_ceiling` moves, so `methodology/report.yaml` stays at `0.3.0`.

### Task 5 Steps 4-6 — applied and verified (2026-08-17)

`lib/ai/sections.ts:188` now carries `{ timeout: 45_000, maxRetries: 1 }`, and
`export const maxDuration = 300` sits on both segments confirmed in Step 2. The plan's Step 6
`git add` lists only `app/app/[churchId]/page.tsx`, but its own Steps 2 and 4 require **both**
segments — both are staged; the omission is a plan-internal slip, not a spec conflict. The
literal snippet's trailing semicolon was dropped: both `app/` files are semicolon-free, while
`lib/ai/sections.ts` is not.

The timeout/retry pair is pinned by a new test in `tests/ai/sections.test.ts` asserting on
`mockParse.mock.calls[0]![1]` — the request **options**, the same house idiom as the existing
`[0]` body assertions, one argument over. Watched RED first: it reported
`expected { timeout: 30000, maxRetries: +0 } to deeply equal { timeout: 45000, maxRetries: 1 }`.

`maxDuration` has no unit-testable behaviour, so `npm run build` is its validator — and it gives
**positive** confirmation, not merely a clean exit. `.next/server/functions-config-manifest.json`
after the build:

```json
{ "/api/cron/reminders": {}, "/api/report/[runId]/pdf": {},
  "/app/[churchId]": { "maxDuration": 300 },
  "/app/[churchId]/diagnosis": { "maxDuration": 300 } }
```

Exactly the two intended segments; `/r/[shareToken]` correctly absent. Gates: `tsc --noEmit`
clean, **1547 tests / 208 files pass**, build compiled in 4.6 s with no warning.
