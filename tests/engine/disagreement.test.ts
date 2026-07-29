import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { calibrationFrom } from '../../lib/engine/calibration';
import { disagreementFor } from '../../lib/engine/disagreement';

describe('disagreement is measured after rater style is removed', () => {
  const methodology = loadFixtureMethodology();

  it('does NOT flag a uniformly harsh rater as conflict', () => {
    // Elder rates every area 3 points below the pastor. Under the old
    // dispersionFor() this raw spread fired on all eight areas and reported a
    // habitually harsh rater as disagreement. Style is constant, so every
    // deviation is zero and nothing is flagged.
    const rows = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
      ...answers(methodology, id, 8, 'Pastor', 'u-pastor'),
      ...answers(methodology, id, 5, 'Elder', 'u-elder'),
    ]);
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    for (const norm of normalized.values()) {
      expect(disagreementFor(norm.fit, calibration, norm.respondentMeans, 2.0)).toBeNull();
    }
  });

  it('DOES flag one area where the same two people genuinely diverge', () => {
    const rows = [
      ...['guest', 'conn', 'disc', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
        ...answers(methodology, id, 8, 'Pastor', 'u-pastor'),
        ...answers(methodology, id, 5, 'Elder', 'u-elder'),
      ]),
      // vol inverts: the elder rates it far above the pastor
      ...answers(methodology, 'vol', 2, 'Pastor', 'u-pastor'),
      ...answers(methodology, 'vol', 9, 'Elder', 'u-elder'),
    ];
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    const vol = normalized.get('vol')!;
    const flag = disagreementFor(vol.fit, calibration, vol.respondentMeans, 2.0);
    expect(flag).not.toBeNull();
    expect(flag!.category_id).toBe('vol');
    // The EXACT value, not a bound. `flag !== null` already entails spread >= 2.0
    // (Step 7 returns null when stddev < threshold), so a >= 2.0 assertion cannot
    // fail. 4.38 is what the deviation path produces and what the OLD raw-effect
    // path cannot: person effects on vol are -3.5/+3.5, both rating styles are
    // +-0.875, so deviations are -4.375/+4.375 -> stddev 4.375 -> 4.38.
    // An implementation that ignores `calibration` yields 3.5 and fails here.
    expect(flag!.spread).toBeCloseTo(4.38, 2);
    expect(flag!.respondents.map((r) => r.label).sort()).toEqual(['Elder', 'Pastor']);

    const guest = normalized.get('guest')!;
    expect(disagreementFor(guest.fit, calibration, guest.respondentMeans, 2.0)).toBeNull();
  });

  it('returns null below two complete respondents', () => {
    const rows = answers(methodology, 'vol', 5, 'Pastor', 'u-pastor');
    const normalized = normalize(rows, methodology);
    const vol = normalized.get('vol')!;
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));
    expect(disagreementFor(vol.fit, calibration, vol.respondentMeans, 2.0)).toBeNull();
  });

  it('does NOT flag a raw spread that is entirely rating style', () => {
    // The discriminating case. Pastor 9 / Elder 3 on all eight areas gives raw
    // person-effect stddev 3.0 — above the 2.0 threshold, so the OLD dispersionFor()
    // would flag all eight areas. Style is constant, so every deviation is 0 and
    // deviation stddev is 0. Without this test the whole suite passes against an
    // implementation whose body is stddev(fit.personEffects.map(p => p.effect)) —
    // i.e. exactly the behaviour Task 5 exists to replace.
    const rows = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
      ...answers(methodology, id, 9, 'Pastor', 'u-pastor'),
      ...answers(methodology, id, 3, 'Elder', 'u-elder'),
    ]);
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    for (const norm of normalized.values()) {
      expect(disagreementFor(norm.fit, calibration, norm.respondentMeans, 2.0)).toBeNull();
    }
  });
});
