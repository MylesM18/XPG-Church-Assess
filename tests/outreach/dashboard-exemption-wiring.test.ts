// Source-reading tripwire (node env, no DOM) + behavioural mirror tests for wiring Tasks 19/20's
// exemption machinery into app/app/[churchId]/page.tsx. page.tsx is an async Server Component
// (awaited params, live Supabase calls), so — following this codebase's convention for this exact
// file (tests/dashboard/self-assessment-wiring.test.ts, viewer-progress.test.ts,
// per-card-progress.test.ts, …) — its wiring is pinned by reading the source text, not by
// rendering it. The guard / matrix-scoping tests below additionally exercise the REAL
// isExemptMember / buildMemberMatrix / effectiveMethodologyForRun functions with the exact call
// shape page.tsx uses, so they catch behavioural regressions a pure string match would miss — see
// each test's mutation note.
//
// REVISED (owner ruling, 2026-08-08): isExemptMember dropped its `deadlineAt`/`now` parameters —
// see lib/coverage/exemption.ts's header comment and tests/coverage/exemption.test.ts for the full
// rationale. The answer page now serves each run's EFFECTIVE methodology unconditionally, so no
// pre-0.3.0-run member (open window or closed) is ever offered the outreach items — exemption is a
// run-level fact, not a per-member one. Several tests below used to pin/prove that TWO members of
// the same run could be classified DIFFERENTLY based on their individual deadlines; that is now
// impossible by construction (every member of one church shares one run — ADR 0001 — and the
// predicate no longer reads anything member-specific), so those tests are rewritten to prove the
// opposite: deadline no longer varies the outcome. The old "boundary instant" describe block is
// removed entirely — there is no more date comparison inside isExemptMember to have a boundary.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isExemptMember } from '@/lib/coverage/exemption';
import { buildMemberMatrix, type MatrixMember, type MemberCategoryCoverageRow } from '@/lib/coverage/member-matrix';
import { effectiveMethodologyForRun } from '@/lib/methodology/effective';
import type { Category } from '@/lib/methodology/schema';

const src = readFileSync('app/app/[churchId]/page.tsx', 'utf8');
// Strip comments so a prose mention can neither satisfy nor break a structural assertion.
const CODE = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('dashboard exemption wiring', () => {
  it('computes exemption from the run version', () => {
    expect(src).toContain('isExemptMember(');
    expect(src).toContain('effectiveMethodologyForRun(');
  });

  it('fetches the run version exactly once', () => {
    expect(src.split('methodology_version').length - 1).toBeGreaterThan(0);
    expect(src.split("select('id, methodology_version, status, closed_at')").length - 1).toBe(1);
  });

  it('per-card totals come from the exempt-aware list, not a hardcoded length', () => {
    expect(src).toContain('ownTotalById');
    expect(src).not.toContain('of {cat.items.length}');
  });

  it('the admin church-wide result uses the run-scoped effective category list, not the full current one', () => {
    // REVISED (owner ruling, 2026-08-08, admin-header fix): the answer page now serves each run's
    // EFFECTIVE methodology unconditionally (Task 29), so no member of a pre-0.3.0 run can EVER
    // produce a response for a since:"0.3.0" item. Leaving the admin arm on the full `categories`
    // list therefore pinned church-wide coverage at 'partial'/0-of-8 PERMANENTLY for every existing
    // (all pre-0.3.0) church — not the "conservative mismatch" it was accepted as, since that
    // rationale assumed an open-window member could still go answer the new items elsewhere. Fixed
    // by exempting the admin arm too, reusing the SAME run-derived list the matrix already uses
    // (runEffectiveCategories) rather than computing a second one.
    expect(src).toContain('coverage(rows, runEffectiveCategories)');
    expect(src).not.toContain('coverage(rows, categories)');
  });

  it('the admin/viewer fork is explicit: admin gets the run-scoped list, viewer gets the exempt-aware own-progress list', () => {
    // Tighter than the assertion above: pins the actual ternary, not just an incidental substring
    // match. Mutation guard: catches the admin arm reverting to the full `categories` list (exactly
    // the bug this fix closes), the branches being swapped, or both collapsing to one shared
    // expression.
    expect(CODE).toContain('isAdmin ? coverage(rows, runEffectiveCategories) : coverage(rows, exemptAwareCats)');
  });

  it("the admin's own-CTA refetch is fed the exempt-aware list", () => {
    // Mutation guard: catches the CTA refetch left on the full `categories` while the viewer path
    // moved to `exemptAwareCats` — an admin's own progress card/CTA would then disagree with a
    // viewer's in the identical exemption scenario.
    expect(CODE).toContain('coverage((memberCoverageData ?? []) as CoverageRow[], exemptAwareCats)');
  });
});

describe('guard 1 — the matrix predicate is run-scoped, never a per-member deadline check', () => {
  it("the matrix's isExempt callback is keyed on the shared run version, not any per-member field", () => {
    // Mutation guard: catches a per-member deadline check creeping back into the closure (e.g.
    // `isExemptMember(m.assessment_deadline_at, ...)` reintroduced) — which would disagree with the
    // answer page's own filtering, which is deadline-blind by construction (owner ruling).
    expect(CODE).toContain('isExempt: () => isExemptMember(run?.methodology_version ?? null)');
    expect(CODE).not.toContain('m.assessment_deadline_at');
  });

  it('two roster members with very different deadlines under the SAME shared run version are classified THE SAME', () => {
    // Behavioural mirror of the exact wiring shape above, using the REAL Task 19/26 functions.
    // Mutation guard: catches deadline creeping back into the exemption decision — which would make
    // an OPEN-window member on a pre-0.3.0 run read as still-incomplete for items the answer page
    // will never even show them: exactly the interaction bug the owner ruling exists to fix.
    const RUN_VERSION = '0.2.0'; // predates 0.3.0; shared by the whole church (one run per church)
    const categories: Category[] = [{
      id: 'guest', name: 'Guest', kind: 'stage', position: 1,
      items: [
        { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
        { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0', theme: 'systems' },
      ],
    }];
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      RUN_VERSION,
    ).questions.categories;
    // CLOSED's window shut a week ago; OPEN's is nearly two months out. Both should read identically.
    const CLOSED: MatrixMember = { user_id: 'closed', full_name: 'Closed', email: 'c@t.com', assessment_deadline_at: '2026-08-01T00:00:00.000Z' };
    const OPEN: MatrixMember = { user_id: 'open', full_name: 'Open', email: 'o@t.com', assessment_deadline_at: '2026-09-30T00:00:00.000Z' };
    const rows: MemberCategoryCoverageRow[] = [
      { respondent_user_id: 'closed', category_id: 'guest', answered_count: 1 },
      { respondent_user_id: 'open', category_id: 'guest', answered_count: 1 },
    ];
    const matrix = buildMemberMatrix([CLOSED, OPEN], rows, categories, {
      isExempt: () => isExemptMember(RUN_VERSION),
      effectiveCategories,
    });
    // Both members answered everything THEY were ever asked (the one pre-0.3.0 item) -> both
    // covered. If deadline still influenced the predicate, OPEN would wrongly read 'partial'.
    expect(matrix.find((r) => r.member.user_id === 'closed')!.cells[0]!.status).toBe('covered');
    expect(matrix.find((r) => r.member.user_id === 'open')!.cells[0]!.status).toBe('covered');
  });
});

describe('guard 2 — a null run version passes through (never defaults to the current version)', () => {
  it('the run version is threaded through with `?? null`, never a non-null default', () => {
    // Mutation guard: catches `run?.methodology_version ?? OUTREACH_VERSION` / `?? '0.3.0'` /
    // `?? methodology.questions.version` — any of which defeats predatesOutreach(null) === true
    // for an unstamped run, silently flipping members on unstamped runs from exempt to NOT exempt.
    expect(CODE).toContain('methodology_version ?? null');
    expect(CODE).not.toContain("methodology_version ?? '0.3.0'");
    expect(CODE).not.toContain('methodology_version ?? OUTREACH_VERSION');
    expect(CODE).not.toContain('methodology_version ?? methodology.questions.version');
  });

  it('a null-version (unstamped) run exempts (the subtle case Task 19/26 documents)', () => {
    // lib/coverage/exemption.ts: predatesOutreach(null) === true, so an unstamped run predates.
    // Pinned here, at the wiring layer, in addition to Task 19/26's own suite — this is exactly the
    // case a well-intentioned `?? currentVersion` default would silently break.
    expect(isExemptMember(null)).toBe(true);
  });
});

describe('guard 3 — a single now snapshot for the whole render', () => {
  it('constructs exactly one Date for the whole render (the existing top-level `now`)', () => {
    // Historically this guarded the exemption computation specifically (isExemptMember used to take
    // a `now` argument). Post owner-ruling, isExemptMember takes no time input at all — exemption is
    // a pure function of the run version — so this now guards the page's REMAINING now-based logic
    // (the completion/invite deadline banners) against a second, later clock read that could
    // disagree with the first mid-render.
    const dateConstructorCount = (CODE.match(/new Date\(\)/g) ?? []).length;
    expect(dateConstructorCount).toBe(1);
  });
});

describe("the matrix's effectiveCategories is run-scoped, never gated by the CURRENT viewer's own exemption", () => {
  it('the matrix call does not reuse the viewer-gated exemptAwareCats identifier', () => {
    // assessment_runs is one row per church (schema comment, 20260727000100_fix_coverage_survives_
    // complete_run.sql): every member of a church shares the SAME run version, so effectiveCategories
    // for the matrix must be a pure function of that shared run version alone — never conditioned on
    // whether the CURRENT viewer (who might not themselves be exempt) happens to be exempt. This
    // remains true (and worth pinning) even though, post owner-ruling, exemptAwareCats and
    // runEffectiveCategories are ALWAYS equal in value — see the behavioural test below for why the
    // distinction still matters structurally.
    expect(CODE).toContain('buildMemberMatrix(');
    expect(
      CODE,
      "effectiveCategories for the matrix must be run-scoped (runEffectiveCategories), not the " +
        'viewer-gated exemptAwareCats — see the behavioural test below for what breaks if it is.',
    ).not.toContain('effectiveCategories: exemptAwareCats');
    expect(CODE).toContain('effectiveCategories: runEffectiveCategories');
  });

  it('behaviourally: an exempt member reads covered only when the denominator is the run-scoped filtered list', () => {
    // Mutation guard: catches `effectiveCategories: categories` (the full/current list) substituted
    // for `effectiveCategories: runEffectiveCategories` in the buildMemberMatrix call — silently
    // un-exempting every member of a pre-0.3.0 run, which is exactly the failure this whole ruling
    // exists to prevent (a member stuck at 'partial' forever for items the answer page will never
    // show them).
    const RUN_VERSION = '0.2.0';
    const categories: Category[] = [{
      id: 'guest', name: 'Guest', kind: 'stage', position: 1,
      items: [
        { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
        { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0', theme: 'systems' },
      ],
    }];
    // page.tsx derives this the same way: effectiveMethodologyForRun keyed on the run version alone.
    const runEffectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      RUN_VERSION,
    ).questions.categories;

    const MEMBER: MatrixMember = { user_id: 'm1', full_name: 'M', email: 'm@t.com', assessment_deadline_at: null };
    const rows: MemberCategoryCoverageRow[] = [{ respondent_user_id: 'm1', category_id: 'guest', answered_count: 1 }];
    const isExempt = (m: MatrixMember) => isExemptMember(RUN_VERSION) && m.user_id === 'm1'; // per-member shape, run-scoped value

    // Correct (run-scoped) wiring: the member answered the only item they were ever offered -> covered.
    const correct = buildMemberMatrix([MEMBER], rows, categories, { isExempt, effectiveCategories: runEffectiveCategories });
    expect(correct[0]!.cells[0]!.status).toBe('covered');

    // The buggy wiring this test guards against: the SAME exempt member would instead read
    // 'partial' forever, because opts.effectiveCategories fell back to the full current list.
    const buggy = buildMemberMatrix([MEMBER], rows, categories, { isExempt, effectiveCategories: categories });
    expect(buggy[0]!.cells[0]!.status).toBe('partial');
  });
});
