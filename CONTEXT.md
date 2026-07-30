# CONTEXT — domain glossary

The shared vocabulary for XPG / Cairn. This is a glossary of the domain nouns that
name the good seams in the codebase, not a full spec. The full methodology and
product rationale live in `docs/XPG-Engineering-Spec.md` and the Frameworks doc;
where the spec and the code disagree, the code is authoritative (the spec is partly
stale — see the two drift notes below).

Terms marked **(new)** were coined during the 2026-07-30 architecture review to give
names to seams that were previously expressed inline at many call sites. See
`docs/adr/0001-review-only-completion-defer-multi-run.md`.

## Actors

- **Admin** — a church's owner (Supabase Auth). Creates the church, answers
  categories, invites leaders, manages viewers, reads the full diagnosis.
- **Viewer** — an approved member (Supabase Auth) who can read the diagnosis but not
  manage access or edit.
- **Member** — an admin or viewer; the pair a church-membership row can hold.
- **Respondent / invited leader** — a person invited to answer one category. In the
  **current** (authenticated) flow they accept a tokenized invitation at `/accept/[token]`,
  which writes a `church_members` row, then answer. *(Drift: the spec §6 anonymous
  `/respond` flow was dropped in migration `20260724000300`.)*

## The engine and its output

- **Methodology** — the versioned IP (YAML under `/methodology`), loaded and schema-
  validated by `lib/methodology/load.ts`. Questions, anchors, thresholds, benchmarks,
  offer copy. Data, not code; every diagnosis is stamped with `methodology_version`.
- **Engine** — the pure diagnosis pipeline under `lib/engine/*`. No framework, DB, or
  network. *(Drift: `diagnose()` in `lib/engine/index.ts` is the spec's advertised
  interface but has no production callers; production enters through
  `lib/report/derive.ts::deriveDiagnosisForRun`.)*
- **Diagnosis** — the deterministic struct the engine produces. The AI never decides
  it; with the AI disabled the full report still renders.
- **Chain** — the ordered stages `guest → conn → disc → vol → gen`.
- **Enablers** — the cross-cutting categories `gov`, `comm`, `sys`.
- **Constraint** — the first broken stage in the chain; the one thing to fix.
- **Blind spot** — a category rated by belief higher than the evidence supports.
- **Dispersion** — disagreement across respondents within a category.

## Runs, coverage, completion

- **Assessment run** — a church's assessment instance. **v1 is single-run**: exactly
  one run is created at church creation (`create_church_with_admin`) and never
  recreated. `save_diagnosis` flips its status `in_progress → complete`, and
  completion is **terminal** for v1.
- **Current run** **(new)** — the church's single run resolved *status-agnostically*
  (`order by created_at limit 1`, no status clause). What the dashboard, coverage,
  the report, and the read-only review view mean by "the run". Interface:
  `currentRun(churchId)` (TS) / `current_run(church_id)` (SQL helper).
- **canAcceptAnswers** **(new)** — the predicate `run.status === 'in_progress'`, i.e.
  "this run may still receive answers". Previously this policy hid inside the `WHERE`
  clause of the run lookup and was re-decided at every call site; it is now a named
  thing. What the write path and the answer form's editable/read-only state mean.
- **Completeness** **(new)** — the single definition of "answered every item":
  `isCategoryComplete(answered, total) = answered === total`, and
  `isRunComplete = every category complete`. Replaces the copies previously living in
  `lib/coverage/coverage.ts`, `lib/engine/fit.ts`, and the two diagnosis gates.
- **Coverage** — how much of the assessment is answered; drives the dashboard's
  per-category and per-member progress and gates the diagnosis (`lib/coverage/*`).
- **Diagnosis gate** — the check that a run is scoreable (every category complete).
  Exists as two adapters over two data shapes — `diagnosisGate(normalized)` and
  `diagnosisGateFromMatrix(matrix)` — because RLS lets the dashboard read only the
  coverage matrix, not raw responses. Both should express the shared **Completeness**
  predicate.

## Report and delivery

- **Report** — the Diagnosis rendered for humans. Screen (React under
  `app/app/[churchId]/diagnosis/report/*`), PDF (`lib/report/pdf/document.tsx` via
  `@react-pdf`), and an opt-in read-only share (`/r/[shareToken]`).
- **Report view** — the presentation view-model built once by `lib/report/view.ts`
  and consumed by both the screen and the PDF adapters.
- **Prose** — the AI-additive report blocks (`lib/ai/prose.ts`), fact-checked, with a
  deterministic **fallback** (`lib/ai/fallback.ts`). The AI rewords; it never decides.

## The permission wall

- **Permission wall** — access enforced at the database layer via Postgres Row-Level
  Security, never a hidden UI element. Members use the anon-key RLS client; privileged
  writes go through `SECURITY DEFINER` RPCs with explicit grants. There is no
  service-role client (`SUPABASE_SERVICE_ROLE_KEY` appears nowhere in code).

## Branding

- **Brand** — a church's identity resolved by `lib/brand/resolve.ts` into
  `{ monogram, tileColor, displayName }`. `tileColor` is deterministic from the name
  and never the reserved berry (`#8E2B3E`).
