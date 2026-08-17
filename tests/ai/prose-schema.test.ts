import { describe, it, expect } from 'vitest';
import { ReportBlocksSchema } from '../../lib/ai/prose';

const fullEight = {
  verdict: 'v', evidence: 'e', blind_spot: 'b', cost: 'c',
  do_not_work_on: 'd', next_step: 'n', gating: 'g', dispersion: 'x',
};
const nullBranch = {
  verdict: 'v', evidence: null, blind_spot: null, cost: null,
  do_not_work_on: null, next_step: 'n', gating: null, dispersion: null,
};

describe('ReportBlocksSchema', () => {
  // Key-set EQUALITY, not a presence check: benchmark_note/dependency_note were dropped from
  // the contract with the appendix (2026-08-16), and this is the OpenAI structured-output
  // shape. A presence check would survive re-adding them; sorted equality does not.
  it('declares exactly the eight contract fields', () => {
    expect(Object.keys(ReportBlocksSchema.shape).sort()).toEqual([
      'blind_spot', 'cost', 'dispersion', 'do_not_work_on', 'evidence', 'gating',
      'next_step', 'verdict',
    ]);
  });
  it('accepts a full 8-field payload', () => {
    expect(ReportBlocksSchema.safeParse(fullEight).success).toBe(true);
  });
  it('accepts the null-branch payload (6 optionals present but null)', () => {
    expect(ReportBlocksSchema.safeParse(nullBranch).success).toBe(true);
  });
  it('rejects a payload missing a required field', () => {
    const { next_step: _drop, ...missingRequired } = fullEight;
    expect(ReportBlocksSchema.safeParse(missingRequired).success).toBe(false);
  });
  it('rejects a payload missing an optional key entirely (strict: all keys present)', () => {
    const { evidence: _drop, ...missingOptionalKey } = fullEight;
    expect(ReportBlocksSchema.safeParse(missingOptionalKey).success).toBe(false);
  });
});
