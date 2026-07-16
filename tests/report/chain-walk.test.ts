import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import { chainWalk } from '../../lib/report/chain-walk';
import { answers, buildResponses } from '../engine/helpers';

const m = loadMethodology();
const ctx = { attendance_band: '500_999' };
const byId = (stages: ReturnType<typeof chainWalk>, id: string) =>
  stages.find((s) => s.category_id === id)!;

describe('chainWalk', () => {
  it('mid-chain constraint: upstream holds, constraint marked, broken downstream is do-not-work-on', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 8), answers(m, 'conn', 2), answers(m, 'disc', 8),
        answers(m, 'vol', 2), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(stages.map((s) => s.category_id)).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
    expect(byId(stages, 'guest').bucket).toBe('holding');
    expect(byId(stages, 'conn').bucket).toBe('constraint');
    expect(byId(stages, 'disc').bucket).toBe('downstream');
    expect(byId(stages, 'vol').bucket).toBe('downstream');
    expect(byId(stages, 'vol').isDoNotWorkOn).toBe(true);
    expect(byId(stages, 'disc').isDoNotWorkOn).toBe(false);
  });

  it('no constraint: every stage holds and nothing is do-not-work-on', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 8), answers(m, 'conn', 8), answers(m, 'disc', 8),
        answers(m, 'vol', 8), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(stages.every((s) => s.bucket === 'holding')).toBe(true);
    expect(stages.every((s) => s.isDoNotWorkOn === false)).toBe(true);
  });

  it('stage-1 constraint: no upstream, the rest are downstream', () => {
    const d = diagnose(
      buildResponses(
        answers(m, 'guest', 2), answers(m, 'conn', 8), answers(m, 'disc', 8),
        answers(m, 'vol', 8), answers(m, 'gen', 8),
        answers(m, 'gov', 8), answers(m, 'comm', 8), answers(m, 'sys', 8),
      ),
      m, ctx,
    );
    const stages = chainWalk(d, m);
    expect(byId(stages, 'guest').bucket).toBe('constraint');
    expect(byId(stages, 'conn').bucket).toBe('downstream');
    expect(byId(stages, 'gen').bucket).toBe('downstream');
  });
});
