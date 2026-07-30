# ADR 0002 — A data-access layer of thin domain-operation modules

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Natalie (owner), architecture review
- **Related:** candidate 1 of the 2026-07-30 architecture review; `CONTEXT.md`;
  supersedes the standalone "candidate 4" (membership one-interface) by absorbing it;
  builds on `lib/runs/current-run.ts` (the prototype, from [ADR 0001](0001-review-only-completion-defer-multi-run.md)).

## Context

Data access has no seam. The "module" is the raw Supabase client: **26 `.from('…')` +
23 `.rpc('…')` calls across ~15 pages and server actions**, each re-expressing table
names, column lists, filter predicates, and RPC names. The same shapes recur:
"load church + caller's role" appears ~4×; `requireAdmin` is cloned byte-for-byte in
two `actions.ts`; the run lookup was copy-pasted (addressed separately in ADR 0001).
Renaming a column or a query means editing N files, and pages/actions can only be
tested against a live database.

## Decision

Introduce **`lib/data/*`**: thin, per-aggregate modules of **domain operations**.

- Each function is `(supabase, ...args) => domain result` — it names what the app needs
  (`loadChurchForMember`, `runCoverage`, `saveDiagnosis`), not how the row is fetched.
  The `.from('…')` / `.rpc('…')` strings and row→type mapping live **only** in `lib/data/*`.
- **Security invariant (spec §15) preserved:** every function takes the existing
  **anon-key + RLS** `createClient()`. This is a *locality* move, not a service-role
  seam — no `service.ts`, no service-role key.
- **Testability is the leverage:** callers inject the client, so tests pass an
  in-memory fake (exactly as `tests/runs/current-run.test.ts` already does) — no DB.
  This is the "second adapter" that makes the seam real.
- **Organized by aggregate:** `churches`, `members`, `runs`, `responses`, `coverage`,
  `diagnoses`, `shares`. `lib/runs/current-run.ts` is the prototype; the runs slice
  re-homes it under `lib/data/`.
- **Absorbs candidate 4.** "Membership/role in one interface" *is* `lib/data/members.ts`;
  the cloned `requireAdmin` and the 5+ inline membership checks collapse into it.

## Alternatives considered

- **Port + adapters** (interface + Supabase adapter + in-memory adapter threaded through
  the app). Rejected for v1: Next App Router server components construct their own
  client, so a single injected port fights the framework. Per-function client injection
  gives the same test leverage without the wiring.
- **A generic repository / query builder.** Rejected: the interface should be *domain
  operations*, not a re-exported ORM. Depth comes from naming what the app does.

## Consequences

- **Positive:** locality (schema knowledge in one place); leverage (one interface, N
  call sites); the data layer becomes unit-testable with a fake client; candidate 4 is
  delivered as a by-product.
- **Cost / sequencing:** ~15 sites across 7 aggregates — this is **multi-PR**, migrated
  one aggregate per PR (gates green, owner merges), not a big-bang refactor.
- **Migration order** (each a small PR):
  1. **churches + members** — highest duplication; also closes candidate 4. *(independent of ADR 0001 — do first.)*
  2. **runs** — re-home `currentRun`. *(do after ADR 0001 / PR #41 merges, or rebase.)*
  3. **coverage** — the coverage RPC calls.
  4. **responses** — `submit_self_response`, `get_my_category_answers`, run-response reads.
  5. **diagnoses** — `save_diagnosis`, `save_prose`, `diagnoses` reads.
  6. **shares** — report-share create/revoke/read.
  7. **invitations** — member-invitation create/preview/accept.
- **Invariant to guard:** a test asserts the `.from(`/`.rpc(` strings appear **only**
  under `lib/data/` (occurrence count outside `lib/data/` trends to zero as slices land).
