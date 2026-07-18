import { z } from 'zod/v4';

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
 *   2. Numeric containment — every number in `ai[field]` must be a value present in `draft[field]`
 *      (checked per field, not against a global allowed set — see rationale below).
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

  // 2. Numeric containment — membership by value, scoped per field. A globally-flat
  // allowed set (draft ∪ serialized Diagnosis) is too permissive: the Diagnosis struct
  // densely covers 0-100 with every category score, percentile, and evidence value, so
  // a reword that migrates a number from one field (or another category entirely) into
  // a DIFFERENT field — e.g. swapping the verdict's primary-category score for a
  // downstream category's score — would pass. A faithful reword never moves a number
  // across fields, so checking containment field-by-field against that same field's
  // draft text closes that hole without rejecting legitimate rewords.
  for (const [key, aiValue] of Object.entries(ai)) {
    if (typeof aiValue !== 'string') continue;
    const draftValue = draft[key as keyof ReportBlocks];
    const allowed = new Set(extractNumbers(typeof draftValue === 'string' ? draftValue : ''));
    for (const n of extractNumbers(aiValue)) {
      if (!allowed.has(n)) return false;
    }
  }

  // 3. Category fidelity — case-insensitive substring of the primary category name.
  if (d.primary_constraint) {
    const names = new Map(methodology.questions.categories.map(c => [c.id, c.name]));
    const primaryName = names.get(d.primary_constraint.category_id) ?? d.primary_constraint.category_id;
    if (!stringValues(ai).toLowerCase().includes(primaryName.toLowerCase())) return false;
  }

  // 4. Primary-score pin — symmetric with (3). The verdict template embeds two numbers
  // ("It scored {primary_score} out of 100"): the church's actual score AND the fixed
  // scale. Per-field containment (2) only forbids ai.verdict from using numbers absent
  // from draft.verdict — but both the real score and 100 are legitimately present there,
  // so a reword that reattaches "100" to the score's noun phrase ("scored 100 out of
  // 100") still passes every prior check. Pin the one number that matters most: when
  // there is a primary constraint, its true score must appear in ai.verdict. Skip (do
  // not crash) if there is no primary constraint, or in the unexpected case its category
  // is missing from d.categories — never trust a non-null assertion over engine output.
  if (d.primary_constraint) {
    const primaryCategory = d.categories.find(c => c.category_id === d.primary_constraint?.category_id);
    if (primaryCategory && !extractNumbers(ai.verdict).includes(primaryCategory.score)) return false;
  }

  return true;
}

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { fallbackProse } from './fallback';

const SYSTEM_PROMPT =
  'You are given a fixed set of facts as a draft report in JSON. You may not add, change, ' +
  'reorder, or invent any number, category, or verdict. Rewrite only the wording of each field. ' +
  'Write in this register: plain words, warm but precise. No em-dashes. No churchy clichés. ' +
  'Sentence case. Active voice. Name things the way a church leader would. If a fact is absent ' +
  'from the struct, do not supply it. Return the same JSON block shape you were given — the same ' +
  'fields, no fields added or dropped. Return only the JSON.';

/** Strict structured output emits every key (null for absent optionals); the TS contract wants
 *  absent optionals as `undefined`. Normalize null → undefined so the result is a real ReportBlocks. */
function toReportBlocks(p: ParsedBlocks): ReportBlocks {
  return {
    verdict: p.verdict,
    evidence: p.evidence ?? undefined,
    blind_spot: p.blind_spot ?? undefined,
    cost: p.cost ?? undefined,
    do_not_work_on: p.do_not_work_on ?? undefined,
    next_step: p.next_step,
    gating: p.gating ?? undefined,
    dispersion: p.dispersion ?? undefined,
    benchmark_note: p.benchmark_note,
  };
}

/**
 * Reword the deterministic draft. NEVER throws: SDK/network error, schema miss, and
 * post-check failure all resolve to null (⇒ caller does nothing ⇒ report recomputes
 * fallbackProse live). The model is handed the finished draft, so it invents no numbers;
 * passesFactCheck is the hard backstop that does not trust the model.
 *
 * Every silent-null path logs a reason so "AI is off" (caller's PROSE_MODE gate) stays
 * distinguishable from "AI is broken" (a failure here). Log `err.message` only — never
 * the error object, the request payload, `d`, or the draft: the user message embeds
 * `JSON.stringify(d)` and `d.dispersion_flags[].respondents[].label` carries respondent
 * names, so logging anything beyond a short reason string would leak report content.
 * This file is under eslint globalIgnores, so console.warn here is lint-clean.
 */
export async function generateProse(
  d: Diagnosis,
  methodology: Methodology,
): Promise<ReportBlocks | null> {
  const draft = fallbackProse(d, methodology);
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env (server-only)
    const model = process.env.ANTHROPIC_MODEL_PROSE ?? 'claude-sonnet-5';
    const message = await client.messages.parse(
      {
        model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              'Draft report — reword each field’s wording only and return the same JSON shape:\n' +
              JSON.stringify(draft, null, 2) +
              '\n\nGround-truth facts — do not introduce any number or category not present here:\n' +
              JSON.stringify(d, null, 2),
          },
        ],
        output_config: { format: zodOutputFormat(ReportBlocksSchema) },
      },
      { timeout: 15000, maxRetries: 0 },
    );

    const parsed = message.parsed_output;
    if (!parsed) {
      console.warn('[m5b] AI prose: model returned no parsed output; falling back to deterministic prose');
      return null;
    }
    const ai = toReportBlocks(parsed);
    if (!passesFactCheck(ai, draft, d, methodology)) {
      // Do not log `ai` or `draft` here — they are report content (respondent labels,
      // church-specific scores), not a diagnostic reason.
      console.warn('[m5b] AI prose: reword failed fact-check (field parity / numeric containment / category or score fidelity); falling back to deterministic prose');
      return null;
    }
    return ai;
  } catch (err) {
    console.warn('[m5b] AI prose: request failed:', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
