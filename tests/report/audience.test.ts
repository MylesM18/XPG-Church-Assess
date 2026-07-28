import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';
import { buildReportView } from '../../lib/report/view';

describe('audience privacy', () => {
  const methodology = loadFixtureMethodology();
  const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
  const d = diagnose(
    ALL.flatMap((id) => [
      ...answers(methodology, id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
      ...answers(methodology, id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
    ]),
    methodology,
    { attendance_band: '100_249' },
  );
  const blocks = fallbackProse(d, methodology);
  const NAMES = ['Pastor Dana', 'Elder Sam'];

  it('pdf and shared carry no respondent names anywhere in the view', () => {
    for (const audience of ['pdf', 'shared'] as const) {
      const json = JSON.stringify(buildReportView(d, blocks, methodology, { audience }));
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });

  it('screen keeps the labelled respondent list under Disagreement, exactly as it ships', () => {
    const v = buildReportView(d, blocks, methodology, { audience: 'screen' });
    // No `if` guard: the fixture is built to fire. vol is 2 vs 9 while every other
    // area is 8 vs 7, so both rating styles are 0 and vol's deviation stddev is 3.5,
    // clearing any plausible thresholds.dispersion. A conditional here would pass
    // silently if buildReportView never populated system.disagreement at all.
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement!.respondents.length).toBeGreaterThan(0);
  });

  it('calibration carries no names on ANY surface, screen included', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      // Stringify the WHOLE system section, not one numeric field. The rendered
      // calibration LINE is prose (system.calibrationText) and that is where a name
      // could actually leak; a number can never contain one, so asserting on
      // calibrationSpread alone cannot fail. `disagreement` is excluded because the
      // labelled respondent list is legitimately screen-only (test above).
      const json = JSON.stringify({ ...v.system, disagreement: undefined });
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });

  it('shared still drops nextStep', () => {
    expect(buildReportView(d, blocks, methodology, { audience: 'shared' }).nextStep).toBeUndefined();
  });
});
