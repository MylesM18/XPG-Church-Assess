import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';

export type TierId = 'healthy_ready' | 'healthy_stretched' | 'strained' | 'at_risk';

export interface Tier {
  id: TierId;
  name: string;
}

export type Archetype = 'capacity' | 'constraint' | 'foundation';

// Descending by min — first band whose lower bound the capacity clears wins, which is
// exactly the half-open-interval semantics of spec P1 (84.6 → healthy_stretched).
const TIER_ORDER: readonly TierId[] = ['healthy_ready', 'healthy_stretched', 'strained', 'at_risk'];

/**
 * Tier label for Diagnosis.capacity (the fractional 8-area mean). Dashboard/register
 * label ONLY (spec P1) — it never selects the archetype below. Thresholds live in
 * rules.yaml `tiers`; the named-key schema guarantees every band exists at load.
 */
export function tierFor(capacity: number, rules: Methodology['rules']): Tier {
  for (const id of TIER_ORDER) {
    const band = rules.tiers[id];
    if (capacity >= band.min) return { id, name: band.name };
  }
  // Unreachable while at_risk.min is 0 and scores are non-negative — kept so a future
  // floor change cannot make this function partial.
  return { id: 'at_risk', name: rules.tiers.at_risk.name };
}

/**
 * Which of the three v1 report skeletons this diagnosis gets (locked decision 3).
 * Pure read of the ToC engine's verdict — GPT never decides a finding:
 * constraint = a stage is broken (carries "do not work on");
 * foundation = no broken stage but enabler(s) gate;
 * capacity   = neither.
 */
export function archetypeFor(d: Pick<Diagnosis, 'primary_constraint' | 'gating_conditions'>): Archetype {
  if (d.primary_constraint) return 'constraint';
  if (d.gating_conditions.length > 0) return 'foundation';
  return 'capacity';
}
