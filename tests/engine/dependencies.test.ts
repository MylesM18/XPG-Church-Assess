import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from './helpers';
import { structuralEdges, readDependencies } from '../../lib/engine/dependencies';

describe('dependency map', () => {
  const methodology = loadFixtureMethodology();
  const rules = methodology.rules;

  it('derives exactly 13 edges from chain + enablers.gates', () => {
    const edges = structuralEdges(rules);
    expect(edges).toHaveLength(13);
    expect(edges.filter((e) => e.kind === 'sequence')).toHaveLength(4);
    expect(edges.filter((e) => e.kind === 'gate')).toHaveLength(9);
  });

  it('expands gates: all to every chain stage', () => {
    const gov = structuralEdges(rules).filter((e) => e.from === 'gov');
    expect(gov.map((e) => e.to)).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
  });

  it('derives the sequential edges in chain order', () => {
    const seq = structuralEdges(rules).filter((e) => e.kind === 'sequence');
    expect(seq.map((e) => `${e.from}->${e.to}`)).toEqual([
      'guest->conn', 'conn->disc', 'disc->vol', 'vol->gen',
    ]);
  });

  it('reads weak upstream + weak downstream as load-bearing', () => {
    const scores = new Map([['sys', 30], ['vol', 40], ['disc', 40]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('load_bearing');
  });

  it('reads strong upstream + weak downstream as clear — the dependency is not the explanation', () => {
    // vol must be BELOW breakThreshold 45 for "weak downstream" to hold. The spec's
    // narrative example uses 48, but 48 > 45, so that pair is the fourth branch
    // (both_strong), not `clear`. Do not "fix" readEdge() to make 48 clear — its
    // four branches match spec §6.1's table exactly.
    const scores = new Map([['sys', 74], ['vol', 40]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('clear');
  });

  it('reads strong upstream + strong downstream as both_strong — the unlisted fourth case', () => {
    const scores = new Map([['sys', 74], ['vol', 48]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('both_strong');
  });

  it('reads weak upstream + strong downstream as at risk', () => {
    const scores = new Map([['sys', 30], ['vol', 80]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('at_risk');
  });

  it('carries the authored statement for every edge, never an invented one', () => {
    const scores = new Map(
      ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].map((id) => [id, 60] as const),
    );
    // No `statement.length > 0` check here: DependencySchema declares
    // statement: z.string().min(1) and readDependencies throws on an edge with no
    // authored entry, so a zero-length statement fails methodology LOAD long before
    // this test runs. Restating an upstream guarantee is an unfailable assertion.
    for (const edge of readDependencies(rules, scores, 45)) {
      expect(edge.statement).not.toMatch(/TODO|TBD|\{|\}/);
    }
  });

  it('works at N=1 — it reads scores, never respondent counts', () => {
    const scores = new Map([['sys', 74], ['vol', 48]]);
    expect(readDependencies(rules, scores, 45).length).toBe(13);
  });
});
