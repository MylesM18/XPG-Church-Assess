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

  it('screen now empties the labelled respondent list under Disagreement', () => {
    const v = buildReportView(d, blocks, methodology, { audience: 'screen' });
    // The fixture is built to fire (vol 2 vs 9 while every other area is 8 vs 7), so the
    // disagreement SECTION still renders — heading + narrative text. Keeping this presence
    // assertion is the non-vacuity guard: the test cannot pass by the section silently
    // disappearing. Only the per-person name list is now stripped (respondent anonymity),
    // on screen exactly as it already was on pdf/shared.
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement!.respondents).toEqual([]);
  });

  it('no respondent names anywhere in the system section on ANY surface, screen included', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      // Stringify the WHOLE system section, disagreement INCLUDED. Previously the labelled
      // respondent list was screen-only, so `disagreement` was excluded here; now that names are
      // stripped on every surface, the entire section — calibration prose AND the disagreement
      // block — must be name-free for screen, pdf, and shared alike.
      const json = JSON.stringify(v.system);
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });

  it('shared still drops nextStep', () => {
    expect(buildReportView(d, blocks, methodology, { audience: 'shared' }).nextStep).toBeUndefined();
  });

  /**
   * The describe()-level fixture above makes every chain stage "holding", so
   * d.primary_constraint is null and fallbackProse() (lib/ai/fallback.ts:33-39) takes its
   * early-return branch — blocks.dispersion is never computed there (that only happens past
   * line 78), so buildReportView's TOP-LEVEL `dispersion` field (view.ts:319-327, separate
   * from `system.disagreement`) is undefined for every audience above and JSON.stringify
   * drops it silently. That left this second strip site unexercised: a test asserting "no
   * names in the view" over an always-undefined field can never fail no matter how that
   * field's respondent-stripping is written.
   *
   * This fixture breaks `guest` (both respondents rate it 2, well under thresholds.break=45)
   * so primary_constraint is non-null and fallbackProse reaches the branch that populates
   * `dispersion` (lib/ai/fallback.ts:78-81), while `vol` stays asymmetric (2 vs 9, same as
   * the describe()-level fixture) so the same disagreement flag still fires and feeds it.
   * guest itself is symmetric (2 vs 2) so it contributes no disagreement of its own — verified
   * empirically that d2.disagreement_flags contains exactly the vol flag, not guest.
   */
  it('screen, pdf, and shared all strip the top-level dispersion.respondents once it is actually populated', () => {
    const d2 = diagnose(
      ALL.flatMap((id) => [
        ...answers(methodology, id, id === 'guest' ? 2 : id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
        ...answers(methodology, id, id === 'guest' ? 2 : id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
      ]),
      methodology,
      { attendance_band: '100_249' },
    );
    const blocks2 = fallbackProse(d2, methodology);
    // Prove the fixture actually exercises the field under test, rather than assuming it —
    // the same discipline as the screen/disagreement test above. Without these two asserts,
    // a regression that made blocks.dispersion undefined again would pass this test silently.
    expect(d2.primary_constraint).not.toBeNull();
    expect(blocks2.dispersion).toBeDefined();

    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d2, blocks2, methodology, { audience });
      expect(v.dispersion).toBeDefined();
      const json = JSON.stringify(v);
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });
});
