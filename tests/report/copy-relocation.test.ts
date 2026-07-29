import { describe, it, expect } from 'vitest';
import { buildReportView } from '@/lib/report/view';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';

/**
 * Finding #3 (spec §10): the two remaining hardcoded church-health strings —
 * `agreementFor`'s split/tight lines and the four dependency-read sentences —
 * move verbatim into methodology/copy.yaml. A verbatim move is a value-equality
 * no-op: the same English before and after, so an equality assertion passes
 * whether the copy is hardcoded or sourced from the file and PROVES NOTHING.
 *
 * These tests prove SOURCING instead of equality: mutate the copy values to a
 * 'ZZ-' sentinel the real copy never contains, then assert the rendered output
 * tracks the sentinel. Hardcoded strings ignore the mutation → the output is the
 * real English → RED. Copy-sourced strings echo the mutation → 'ZZ-' → GREEN.
 */
describe('finding #3 — church-health copy is sourced from methodology, not hardcoded', () => {
  const fixtureMethodology = loadFixtureMethodology();

  // Real-id fixture (mirrors tests/report/view.test.ts:204-235): the fake-id
  // diagnosis() factory does not route areas through buildAreas, so agreement is
  // null there. diagnose() reads rules/questions/benchmarks — never copy — so the
  // Diagnosis is derived from the REAL methodology; only buildReportView sees the
  // mutated copy below.
  const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
  const varied = (id: string, base: number): Record<string, number> =>
    Object.fromEntries(
      fixtureMethodology.questions.categories
        .find((c) => c.id === id)!
        .items.map((it, i) => [it.id, i === 2 ? base - 3 : base]),
    );
  const d = diagnose(
    ALL.flatMap((id) => [
      ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 4 : 8), 'Pastor', 'u-1'),
      ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 5 : 7), 'Elder', 'u-2'),
    ]),
    fixtureMethodology,
    { attendance_band: '100_249' }, // underscore — benchmarks.yaml band key
  );

  // Shallow-clone the methodology with sentinel copy. interp() replaces {tokens},
  // so split keeps its {spread} and the reads keep {fromName}/{toName}; the 'ZZ-'
  // prefix survives interpolation regardless of which read fired.
  const mutated = {
    ...fixtureMethodology,
    copy: {
      ...fixtureMethodology.copy,
      dossier: {
        ...fixtureMethodology.copy.dossier,
        agreement: { split: 'ZZ-split {spread}', tight: 'ZZ-tight' },
      },
      dependency_reads: {
        load_bearing: 'ZZ-lb {fromName}',
        clear: 'ZZ-clr',
        at_risk: 'ZZ-ar',
        both_strong: 'ZZ-bs',
      },
    },
  };

  const view = buildReportView(d, fallbackProse(d, mutated), mutated, { audience: 'screen' });

  it('sources each area agreement line from copy.dossier.agreement', () => {
    const agreements = view.areas.map((a) => a.agreement).filter((x): x is string => x !== null);
    expect(agreements.length).toBeGreaterThan(0); // non-vacuous: the fixture populates agreement
    for (const line of agreements) {
      expect(line).toMatch(/^ZZ-/);
    }
  });

  it('sources each dependency-read sentence from copy.dependency_reads', () => {
    expect(view.system.dependencies.length).toBeGreaterThan(0); // non-vacuous: 13 authored edges
    for (const e of view.system.dependencies) {
      expect(typeof e.readSentence).toBe('string');
      expect(e.readSentence).toMatch(/^ZZ-/);
    }
  });
});
