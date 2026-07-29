import { describe, it, expect } from 'vitest';
import type { Diagnosis } from '../../lib/engine/types';

describe('engine types', () => {
  it('a Diagnosis object satisfies the §7.6 shape', () => {
    const d: Diagnosis = {
      methodology_version: '0.1.0',
      throughput: 0,
      capacity: 0,
      gap: 0,
      categories: [],
      primary_constraint: null,
      contributing: [],
      do_not_work_on: [],
      gating_conditions: [],
      generosity_mode: null,
      blind_spots: [],
      disagreement_flags: [],
      calibration: { people: [], spread: 0 },
      dependencies: [],
      correlations: [],
      offer: { type: 't', call_type: 'c', hook: 'h' },
      confidence: 1,
      evidence_trail: [],
    };
    expect(d.methodology_version).toBe('0.1.0');
  });
});
