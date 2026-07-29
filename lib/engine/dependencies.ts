import type { Rules } from '../methodology/schema';

export type EdgeKind = 'sequence' | 'gate';

/**
 * How this church's actual scores read against the edge (spec §6.1):
 *   load_bearing — weak -> weak: this dependency is active and costing you
 *   clear        — strong -> weak: the dependency is not the explanation; look elsewhere
 *   at_risk      — weak -> strong: downstream is running on borrowed time
 *   both_strong  — nothing to say
 */
export type EdgeRead = 'load_bearing' | 'clear' | 'at_risk' | 'both_strong';

export interface DependencyEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  statement: string;
  read: EdgeRead;
  fromScore: number;
  toScore: number;
}

/**
 * The 13 edges derive STRUCTURALLY from rules.yaml: four sequential from `chain`,
 * nine from `enablers.gates`. The structure ships with the code; the prose
 * statements are XPG methodology and live in rules.yaml (spec §10).
 */
export function structuralEdges(rules: Rules): Array<{ from: string; to: string; kind: EdgeKind }> {
  const edges: Array<{ from: string; to: string; kind: EdgeKind }> = [];

  for (let i = 0; i < rules.chain.length - 1; i++) {
    edges.push({ from: rules.chain[i]!, to: rules.chain[i + 1]!, kind: 'sequence' });
  }

  for (const [enablerId, cfg] of Object.entries(rules.enablers)) {
    const targets = cfg.gates === 'all' ? rules.chain : cfg.gates;
    for (const to of targets) edges.push({ from: enablerId, to, kind: 'gate' });
  }

  return edges;
}

function readEdge(fromScore: number, toScore: number, breakThreshold: number): EdgeRead {
  const fromWeak = fromScore < breakThreshold;
  const toWeak = toScore < breakThreshold;
  if (fromWeak && toWeak) return 'load_bearing';
  if (!fromWeak && toWeak) return 'clear';
  if (fromWeak && !toWeak) return 'at_risk';
  return 'both_strong';
}

/**
 * Deterministic and works at N=1 — it reads scores, never respondent counts.
 * This is what lets the constraint section say where NOT to spend, backed by
 * structure: "Systems (74) gates Volunteers (48). Systems is holding — so systems
 * is not what's capping your volunteers."
 */
export function readDependencies(
  rules: Rules,
  scores: Map<string, number>,
  breakThreshold: number,
): DependencyEdge[] {
  const authored = new Map(rules.dependencies.map(d => [`${d.from}->${d.to}`, d]));

  return structuralEdges(rules).map(e => {
    const key = `${e.from}->${e.to}`;
    const d = authored.get(key);
    if (!d) throw new Error(`dependencies: no authored statement for edge "${key}"`);
    const fromScore = scores.get(e.from) ?? 0;
    const toScore = scores.get(e.to) ?? 0;
    return {
      from: e.from,
      to: e.to,
      kind: e.kind,
      statement: d.statement,
      read: readEdge(fromScore, toScore, breakThreshold),
      fromScore,
      toScore,
    };
  });
}
