import { describe, it, expect } from 'vitest';
import { ReportBlocksSchema } from '../../lib/ai/prose';

const fullNine = {
  verdict: 'v', evidence: 'e', blind_spot: 'b', cost: 'c',
  do_not_work_on: 'd', next_step: 'n', gating: 'g', dispersion: 'x', benchmark_note: 'bm',
};
const nullBranch = {
  verdict: 'v', evidence: null, blind_spot: null, cost: null,
  do_not_work_on: null, next_step: 'n', gating: null, dispersion: null, benchmark_note: 'bm',
};

describe('ReportBlocksSchema', () => {
  it('accepts a full 9-field payload', () => {
    expect(ReportBlocksSchema.safeParse(fullNine).success).toBe(true);
  });
  it('accepts the null-branch payload (6 optionals present but null)', () => {
    expect(ReportBlocksSchema.safeParse(nullBranch).success).toBe(true);
  });
  it('rejects a payload missing a required field', () => {
    const { next_step: _drop, ...missingRequired } = fullNine;
    expect(ReportBlocksSchema.safeParse(missingRequired).success).toBe(false);
  });
  it('rejects a payload missing an optional key entirely (strict: all keys present)', () => {
    const { evidence: _drop, ...missingOptionalKey } = fullNine;
    expect(ReportBlocksSchema.safeParse(missingOptionalKey).success).toBe(false);
  });
});
