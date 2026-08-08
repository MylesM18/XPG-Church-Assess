// Source-reading tripwire (node env, no DOM) + behavioural mirror tests for wiring Tasks 19/20's
// exemption machinery into app/app/[churchId]/page.tsx. page.tsx is an async Server Component
// (awaited params, live Supabase calls), so — following this codebase's convention for this exact
// file (tests/dashboard/self-assessment-wiring.test.ts, viewer-progress.test.ts,
// per-card-progress.test.ts, …) — its wiring is pinned by reading the source text, not by
// rendering it. The guard / boundary / matrix-scoping tests below additionally exercise the REAL
// isExemptMember / buildMemberMatrix / effectiveMethodologyForRun functions with the exact call
// shape page.tsx uses, so they catch behavioural regressions a pure string match would miss — see
// each test's mutation note.
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

  it('the admin/viewer fork is explicit: only viewers get the exempt-aware own-progress result', () => {
    // Tighter than the assertion above: pins the actual ternary, not just an incidental substring
    // match. Mutation guard: catches the branches being swapped (admin becomes exempt-aware,
    // viewer stays church-wide) or collapsed to one branch shared by both roles — either of which
    // would leak the exemption into the admin's church-wide header/dots/gate, or deny it to viewers.
    expect(CODE).toContain('isAdmin ? coverage(rows, categories) : coverage(rows, exemptAwareCats)');
  });

  it("the admin's own-CTA refetch is fed the exempt-aware list", () => {
    // Mutation guard: catches the CTA refetch left on the full `categories` while the viewer path
    // moved to `exemptAwareCats` — an admin's own progress card/CTA would then disagree with a
    // viewer's in the identical exemption scenario.
    expect(CODE).toContain('coverage((memberCoverageData ?? []) as CoverageRow[], exemptAwareCats)');
  });
});

describe('guard 1 — per-member sourcing (never a church-wide/first-member/shared value)', () => {
  it("the matrix's isExempt callback reads the deadline off its own member argument", () => {
    // Mutation guard: catches the callback closing over the outer, viewer-only `deadlineAt`
    // instead of the per-member `m.assessment_deadline_at` — which would make every roster
    // member's exemption collapse to whatever the single logged-in viewer happens to have.
    expect(CODE).toContain(
      'isExemptMember(m.assessment_deadline_at, run?.methodology_version ?? null, now)',
    );
  });

  it('two roster members with different deadlines under the SAME shared run version are classified differently', () => {
    // Behavioural mirror of the exact wiring shape above, using the REAL Task 19/20 functions
    // (assessment_runs is one row per church, so the run version is legitimately shared — only
    // the deadline varies per member). Mutation guard: catches the predicate being built from a
    // single shared/first-member deadline instead of each member's own field — both members would
    // then land on the same side regardless of their individual deadlines.
    const now = new Date('2026-08-08T00:00:00.000Z');
    const RUN_VERSION = '0.2.0'; // predates 0.3.0; shared by the whole church (one run per church)
    const categories: Category[] = [{
      id: 'guest', name: 'Guest', kind: 'stage', position: 1,
      items: [
        { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
        { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0' },
      ],
    }];
    // The real Task 2 function, not a hand-assembled list (a hand-assembled list is exactly how
    // Task 20's review said the totals.get(cat.id) ?? cat.items.length fallback goes stale).
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      RUN_VERSION,
    ).questions.categories;
    const CLOSED: MatrixMember = { user_id: 'closed', full_name: 'Closed', email: 'c@t.com', assessment_deadline_at: '2026-08-01T00:00:00.000Z' };
    const OPEN: MatrixMember = { user_id: 'open', full_name: 'Open', email: 'o@t.com', assessment_deadline_at: '2026-08-20T00:00:00.000Z' };
    const rows: MemberCategoryCoverageRow[] = [
      { respondent_user_id: 'closed', category_id: 'guest', answered_count: 1 },
      { respondent_user_id: 'open', category_id: 'guest', answered_count: 1 },
    ];
    const matrix = buildMemberMatrix([CLOSED, OPEN], rows, categories, {
      isExempt: (m) => isExemptMember(m.assessment_deadline_at, RUN_VERSION, now),
      effectiveCategories,
    });
    // Closed-window member answered everything THEY were asked (the one pre-0.3.0 item) -> covered.
    expect(matrix.find((r) => r.member.user_id === 'closed')!.cells[0]!.status).toBe('covered');
    // Open-window member answered only 1 of the 2 CURRENT items -> still partial. If the predicate
    // ignored per-member deadlines, this member would wrongly read 'covered' too.
    expect(matrix.find((r) => r.member.user_id === 'open')!.cells[0]!.status).toBe('partial');
  });
});

describe('guard 2 — a null run version passes through (never defaults to the current version)', () => {
  it('the run version is threaded through with `?? null`, never a non-null default', () => {
    // Mutation guard: catches `run?.methodology_version ?? OUTREACH_VERSION` / `?? '0.3.0'` /
    // `?? methodology.questions.version` — any of which defeats predatesOutreach(null) === true
    // for an unstamped run, silently flipping closed-window members on unstamped runs from exempt
    // to NOT exempt.
    expect(CODE).toContain('methodology_version ?? null');
    expect(CODE).not.toContain("methodology_version ?? '0.3.0'");
    expect(CODE).not.toContain('methodology_version ?? OUTREACH_VERSION');
    expect(CODE).not.toContain('methodology_version ?? methodology.questions.version');
  });

  it('a null-version run with a passed deadline exempts (the subtle case Task 19 documents)', () => {
    // lib/coverage/exemption.ts: predatesOutreach(null) === true, so an unstamped run predates.
    // Pinned here, at the wiring layer, in addition to Task 19's own suite — this is exactly the
    // case a well-intentioned `?? currentVersion` default would silently break.
    const now = new Date('2026-08-08T00:00:00.000Z');
    const past = '2026-08-01T00:00:00.000Z';
    expect(isExemptMember(past, null, now)).toBe(true);
  });
});

describe('guard 3 — a single now snapshot for the whole matrix build', () => {
  it('constructs exactly one Date for the whole render (the existing top-level `now`)', () => {
    // Mutation guard: catches a SECOND `new Date()` introduced for the exemption computation —
    // especially inside the matrix's per-member isExempt callback, where it would be evaluated
    // once per roster member during buildMemberMatrix's .map, letting a member near their
    // boundary flap between exempt and not-exempt depending on timing.
    const dateConstructorCount = (CODE.match(/new Date\(\)/g) ?? []).length;
    expect(dateConstructorCount).toBe(1);
  });

  it('both isExemptMember call sites close over that same `now`, not a fresh Date', () => {
    expect(CODE).toContain('isExemptMember(deadlineAt, run?.methodology_version ?? null, now)');
    expect(CODE).toContain(
      'isExemptMember(m.assessment_deadline_at, run?.methodology_version ?? null, now)',
    );
  });
});

describe('boundary instant: exactly-at-deadline is NOT exempt', () => {
  it('a deadline equal to `now` to the millisecond is not exempt (only strict `>` tells `>` from `>=`)', () => {
    // Task 19's review: only an exact-equality test distinguishes the strict `>` this wiring
    // relies on from a wrongly-inclusive `>=`. Exercised here, at the wiring layer, with the same
    // call shape used for both the viewer's own `exempt` flag and the matrix's per-member check.
    const now = new Date('2026-08-08T12:00:00.000Z');
    expect(isExemptMember(now.toISOString(), '0.2.0', now)).toBe(false);
  });
});

describe("the matrix's effectiveCategories is run-scoped, never gated by the CURRENT viewer's own exemption", () => {
  it('the matrix call does not reuse the viewer-gated exemptAwareCats identifier', () => {
    // assessment_runs is one row per church (schema comment, 20260727000100_fix_coverage_survives_
    // complete_run.sql): every member of a church shares the SAME run version, so effectiveCategories
    // for the matrix must be a pure function of that shared run version alone — never conditioned on
    // whether the CURRENT viewer (who might not themselves be exempt) happens to be exempt.
    expect(CODE).toContain('buildMemberMatrix(');
    expect(
      CODE,
      "effectiveCategories for the matrix must be run-scoped (runEffectiveCategories), not the " +
        'viewer-gated exemptAwareCats — see the behavioural test below for what breaks if it is.',
    ).not.toContain('effectiveCategories: exemptAwareCats');
    expect(CODE).toContain('effectiveCategories: runEffectiveCategories');
  });

  it('behaviourally: a non-exempt CURRENT viewer does not blind the matrix to an exempt OTHER member', () => {
    // Mutation guard: catches `effectiveCategories: exemptAwareCats` (reads naturally, since
    // exemptAwareCats is already in scope) — which silently un-exempts every OTHER roster member
    // whenever the CURRENT viewer's own deadline hasn't passed, making the matrix's truth depend
    // on who happens to be looking at it.
    const now = new Date('2026-08-08T00:00:00.000Z');
    const RUN_VERSION = '0.2.0';
    const categories: Category[] = [{
      id: 'guest', name: 'Guest', kind: 'stage', position: 1,
      items: [
        { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
        { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0' },
      ],
    }];
    // page.tsx derives this the same way: effectiveMethodologyForRun keyed on the run version
    // alone, with no member/viewer argument to gate on.
    const runEffectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      RUN_VERSION,
    ).questions.categories;

    // The CURRENT viewer (e.g. an admin) is NOT exempt themselves — future deadline.
    const viewerExempt = isExemptMember('2026-09-01T00:00:00.000Z', RUN_VERSION, now);
    expect(viewerExempt).toBe(false);
    // What a viewer-gated (buggy) wiring would pass as effectiveCategories: since viewerExempt is
    // false, it falls back to the FULL current list — wrong for the exempt OTHER member below.
    const viewerGatedEffectiveCategories = viewerExempt ? runEffectiveCategories : categories;

    const EXEMPT_OTHER: MatrixMember = { user_id: 'other', full_name: 'Other', email: 'x@t.com', assessment_deadline_at: '2026-08-01T00:00:00.000Z' };
    const rows: MemberCategoryCoverageRow[] = [{ respondent_user_id: 'other', category_id: 'guest', answered_count: 1 }];
    const isExempt = (m: MatrixMember) => isExemptMember(m.assessment_deadline_at, RUN_VERSION, now);

    // Correct (run-scoped) wiring: the exempt other member reads covered.
    const correct = buildMemberMatrix([EXEMPT_OTHER], rows, categories, { isExempt, effectiveCategories: runEffectiveCategories });
    expect(correct[0]!.cells[0]!.status).toBe('covered');

    // The buggy (viewer-gated) wiring this test guards against: the SAME exempt member would
    // instead read partial, because opts.effectiveCategories silently fell back to the full list.
    const buggy = buildMemberMatrix([EXEMPT_OTHER], rows, categories, { isExempt, effectiveCategories: viewerGatedEffectiveCategories });
    expect(buggy[0]!.cells[0]!.status).toBe('partial');
  });
});
