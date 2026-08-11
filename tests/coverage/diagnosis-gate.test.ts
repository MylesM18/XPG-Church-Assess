import { describe, it, expect } from 'vitest';
import type { Category } from '../../lib/methodology/schema';
import { loadFixtureMethodology, answers, partialAnswers } from '../engine/helpers';
import { normalize } from '../../lib/engine/normalize';
import { diagnosisGate, diagnosisGateFromMatrix } from '../../lib/coverage/diagnosis-gate';
import { buildMemberMatrix } from '../../lib/coverage/member-matrix';

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('diagnosisGate', () => {
  const methodology = loadFixtureMethodology();
  const cats = methodology.questions.categories;

  it('passes when every area has at least one complete respondent', () => {
    const rows = ALL.flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1'));
    expect(diagnosisGate(normalize(rows, methodology), cats)).toEqual({ ok: true, blockedAreas: [] });
  });

  it('blocks the area where every item is answered but nobody finished it', () => {
    // Five different people each answer exactly one item of vol. Old gate: PASS
    // (every item has a response). New gate: BLOCKED (nobody completed the area).
    const volItems = cats.find((c) => c.id === 'vol')!.items.map((it) => it.id);
    const rows = [
      ...ALL.filter((id) => id !== 'vol').flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1')),
      ...volItems.flatMap((itemId, i) =>
        partialAnswers(methodology, 'vol', [itemId], 6, `P${i}`).map((r) => ({
          ...r,
          respondent_id: `u-p${i}`,
        })),
      ),
    ];
    const result = diagnosisGate(normalize(rows, methodology), cats);
    expect(result.ok).toBe(false);
    expect(result.blockedAreas).toEqual(['vol']);
  });

  it('lists every blocked area, not just the first', () => {
    const rows = ['guest', 'conn'].flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1'));
    const result = diagnosisGate(normalize(rows, methodology), cats);
    expect(result.ok).toBe(false);
    expect(result.blockedAreas).toEqual(['disc', 'vol', 'gen', 'gov', 'comm', 'sys']);
  });
});

// Minimal two-category fixture (5 items each), matching the pattern used by
// tests/coverage/coverage.test.ts and tests/coverage/member-matrix.test.ts — the dashboard
// gate is a coverage-layer helper, not an engine one, so it doesn't need the real methodology.
function cat(id: string, itemIds: string[]): Category {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'stage',
    position: 1,
    items: itemIds.map((iid) => ({
      id: iid,
      text: 't',
      signal: 'belief',
      anchors: { lo: 'l', mid: 'm', hi: 'h' },
      theme: 'systems',
    })),
  };
}

describe('diagnosisGateFromMatrix', () => {
  const CATS: Category[] = [cat('guest', ['G1', 'G2', 'G3', 'G4', 'G5']), cat('conn', ['C1', 'C2', 'C3', 'C4', 'C5'])];
  const MEMBERS = [
    { user_id: 'u1', full_name: 'Ann', email: 'ann@t.com', assessment_deadline_at: null },
    { user_id: 'u2', full_name: 'Ben', email: 'ben@t.com', assessment_deadline_at: null },
  ];

  it('passes when a single member has covered every area', () => {
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 5 },
      { respondent_user_id: 'u1', category_id: 'conn', answered_count: 5 },
    ], CATS);
    expect(diagnosisGateFromMatrix(matrix, CATS)).toEqual({ ok: true, blockedAreas: [] });
  });

  it('blocks an area nobody individually completed, even though it is covered in aggregate across members', () => {
    // u1 answered 3 of guest's 5 items, u2 answered the other 2 -- together every item of
    // guest has a response, but no ONE member completed the area, so it stays blocked.
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 3 },
      { respondent_user_id: 'u2', category_id: 'guest', answered_count: 2 },
      { respondent_user_id: 'u1', category_id: 'conn', answered_count: 5 },
    ], CATS);
    const result = diagnosisGateFromMatrix(matrix, CATS);
    expect(result.ok).toBe(false);
    expect(result.blockedAreas).toEqual(['guest']);
  });

  it('blocks every area when the matrix is empty', () => {
    expect(diagnosisGateFromMatrix([], CATS)).toEqual({ ok: false, blockedAreas: ['guest', 'conn'] });
  });
});
