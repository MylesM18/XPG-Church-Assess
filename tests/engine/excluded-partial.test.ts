import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { diagnose } from '../../lib/engine';

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('excluded partial respondents are reported, not hidden', () => {
  const methodology = loadFixtureMethodology();

  it('counts the person whose unfinished answers did not count', () => {
    const rows = [
      ...ALL.flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-pastor')),
      ...partialAnswers(methodology, 'vol', ['V1'], 1, 'Elder').map((r) => ({
        ...r,
        respondent_id: 'u-elder',
      })),
    ];
    const d = diagnose(rows, methodology, { attendance_band: '100_249' });
    const vol = d.categories.find((c) => c.category_id === 'vol')!;
    expect(vol.excluded_partial).toBe(1);
    expect(vol.respondent_count).toBe(1);
    const guest = d.categories.find((c) => c.category_id === 'guest')!;
    expect(guest.excluded_partial).toBe(0);
  });
});
