import { describe, it, expect } from 'vitest';
import { resolveReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import { diagnose } from '../../lib/engine';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import type { DeriveResult } from '@/lib/report/derive';

const methodology = loadMethodology();

/**
 * CT-2(c) repurpose of the old "stale payload" unit (the branch review's finding CT-1).
 *
 * Under re-derive-at-render, resolveReportView no longer receives a cached Diagnosis and no
 * longer compares methodology_version at all: the input is always freshly re-derived from the
 * run's responses under the CURRENT methodology, so version-staleness is structurally
 * impossible. resolveReportView now consumes a DeriveResult and turns a NOT-OK derive (some
 * area has no complete respondent, or the attendance band is not a benchmark key) into a
 * graceful `scoreable: false` state instead of building a view.
 *
 * The CT-1 laziness invariant is PRESERVED and still the load-bearing guarantee: `blocks` is a
 * lazy thunk (the ONLY path to fallbackProse / buildReportView), and it must never run when the
 * derive is not ok. resolveReportView is the one place all three surfaces share, so pinning the
 * thunk's laziness here proves it for every call site at once.
 */
const INCOMPLETE: DeriveResult = { ok: false, reason: 'incomplete_areas', blockedAreas: ['disc', 'vol'] };
const UNKNOWN_BAND: DeriveResult = { ok: false, reason: 'unknown_band' };

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
const OK: DeriveResult = {
  ok: true,
  diagnosis: diagnose(
    ALL.flatMap((id) => [
      ...answers(loadFixtureMethodology(), id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
      ...answers(loadFixtureMethodology(), id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
    ]),
    loadFixtureMethodology(),
    { attendance_band: '100_249' },
  ),
};

describe('resolveReportView maps a DeriveResult to a scoreable-or-not resolution (CT-2c)', () => {
  it('returns scoreable:false for an incomplete-areas derive WITHOUT ever invoking the blocks thunk', () => {
    let thunkCalled = false;
    const resolution = resolveReportView(
      INCOMPLETE,
      methodology,
      (d) => { thunkCalled = true; return fallbackProse(d, methodology); },
      { audience: 'screen' },
    );
    expect(resolution).toEqual({ scoreable: false, reason: 'incomplete_areas', blockedAreas: ['disc', 'vol'] });
    expect(thunkCalled).toBe(false);
  });

  it('returns scoreable:false with an empty blockedAreas for an unknown-band derive, thunk untouched', () => {
    let thunkCalled = false;
    const resolution = resolveReportView(
      UNKNOWN_BAND,
      methodology,
      (d) => { thunkCalled = true; return fallbackProse(d, methodology); },
      { audience: 'screen' },
    );
    expect(resolution).toEqual({ scoreable: false, reason: 'unknown_band', blockedAreas: [] });
    expect(thunkCalled).toBe(false);
  });

  it('returns scoreable:true and builds the view for an ok derive, invoking the thunk exactly once', () => {
    let thunkCalls = 0;
    const resolution = resolveReportView(
      OK,
      methodology,
      (d) => { thunkCalls += 1; return fallbackProse(d, methodology); },
      { audience: 'screen' },
    );
    expect(resolution.scoreable).toBe(true);
    if (!resolution.scoreable) throw new Error('unreachable — asserted scoreable above');
    expect(resolution.view.verdict.length).toBeGreaterThan(0);
    expect(resolution.view.areas).toHaveLength(8);
    expect(thunkCalls).toBe(1);
  });
});
