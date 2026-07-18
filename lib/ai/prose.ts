import { z } from 'zod';

/**
 * Mirrors the shipped 9-field ReportBlocks contract (lib/ai/fallback.ts).
 * Required: verdict, next_step, benchmark_note. The 6 optional fields are
 * `.nullable()` (present-but-null) rather than `.optional()`: Anthropic strict
 * structured outputs emit every property, so the model returns null for an
 * absent field. passesFactCheck (Task 2) treats null/undefined/'' identically,
 * so the field-parity invariant holds regardless.
 */
export const ReportBlocksSchema = z.object({
  verdict: z.string(),
  evidence: z.string().nullable(),
  blind_spot: z.string().nullable(),
  cost: z.string().nullable(),
  do_not_work_on: z.string().nullable(),
  next_step: z.string(),
  gating: z.string().nullable(),
  dispersion: z.string().nullable(),
  benchmark_note: z.string(),
});

export type ParsedBlocks = z.infer<typeof ReportBlocksSchema>;

import type { Diagnosis } from '../engine/types';
import type { Methodology } from '../methodology/schema';
import type { ReportBlocks } from './fallback';

/** A field is "populated" iff it is a non-empty string after trim. */
function populatedFields(b: ReportBlocks): Set<string> {
  const s = new Set<string>();
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'string' && v.trim().length > 0) s.add(k);
  }
  return s;
}

/** Every int/decimal token, normalized by numeric value (strip thousands separators; % is dropped by the digit match). */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map(t => Number.parseFloat(t.replace(/,/g, '')));
}

function stringValues(b: ReportBlocks): string {
  return Object.values(b).filter((v): v is string => typeof v === 'string').join(' ');
}

/**
 * Q3 guardrail. Pure, no I/O. Any failing check ⇒ generateProse returns null.
 *   1. Field parity     — the set of populated fields in `ai` must equal that of `draft`.
 *   2. Numeric containment — every number in `ai` must be a value present in draft ∪ serialized Diagnosis.
 *   3. Category fidelity — if primary_constraint is non-null, its category name must appear in `ai`.
 */
export function passesFactCheck(
  ai: ReportBlocks,
  draft: ReportBlocks,
  d: Diagnosis,
  methodology: Methodology,
): boolean {
  // 1. Field parity — catches dropped facts AND invented sections.
  const aiFields = populatedFields(ai);
  const draftFields = populatedFields(draft);
  if (aiFields.size !== draftFields.size) return false;
  for (const f of draftFields) if (!aiFields.has(f)) return false;

  // 2. Numeric containment — membership by value, not count.
  const allowed = new Set<number>([
    ...extractNumbers(JSON.stringify(draft)),
    ...extractNumbers(JSON.stringify(d)),
  ]);
  for (const n of extractNumbers(stringValues(ai))) {
    if (!allowed.has(n)) return false;
  }

  // 3. Category fidelity — case-insensitive substring of the primary category name.
  if (d.primary_constraint) {
    const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
    const primaryName = names.get(d.primary_constraint.category_id) ?? d.primary_constraint.category_id;
    if (!stringValues(ai).toLowerCase().includes(primaryName.toLowerCase())) return false;
  }

  return true;
}
