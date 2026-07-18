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
