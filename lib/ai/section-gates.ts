import type { CategoryFact, FactsPack } from '../report/facts';
import type { Methodology, RequiredMention } from '../methodology/schema';
import { SECTION_REGISTRY, type AiSectionId } from './sections';

/**
 * The six gate families (parent spec line 73). All must pass, or that section falls back.
 *
 * Pure — no I/O, no SDK, no network; the gate runs on already-fetched model output.
 */
export interface GateContext {
  facts: FactsPack;
  methodology: Methodology;
  /** Every run respondent's label. From a LabelSource at the call site — never a bare list. */
  labels: readonly string[];
}

/** Every int/decimal token, normalized by value. Copy of prose.ts:40-43's idiom, not an import:
 *  that module's export surface is the reword pipeline, and coupling the two would join things
 *  that change for different reasons — the same call view.ts:93 makes about `interp`. */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((t) => Number.parseFloat(t.replace(/,/g, '')));
}

/** Every string anywhere in the parsed section, flattened. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) allStrings(x, out);
  return out;
}

const THEME_WORDS: Record<string, string[]> = {
  systems: ['systems', 'systemic'],
  culture: ['culture', 'cultural'],
  theology: ['theology', 'theological'],
  relational: ['relational', 'relationship'],
};

/** The percentage scale denominator. report.yaml's s2/s3/s12 templates all say "…out of 100",
 *  but FactsPack carries no literal 100 anywhere — there is no `scale` field. Without this,
 *  every on-template composition of those sections is falsely rejected in production. */
const SCALE_DENOMINATOR = 100;

/** The two sections whose payload is an array keyed to a category, and the field carrying it.
 *  Partial because the other five have no category-keyed array at all — an entry here is what
 *  opts a section into gate 1b, so adding one is deliberate. */
const COVERAGE_FIELD: Partial<Record<AiSectionId, 'strengths' | 'areas'>> = { s5: 'strengths', s6: 'areas' };

export function gateSection(id: AiSectionId, parsed: unknown, ctx: GateContext): string | null {
  // 1. Field parity — the schema is the expectation. A shape miss and a blank required field
  // are the same failure: the section did not come back whole.
  const check = SECTION_REGISTRY[id].schema.safeParse(parsed);
  if (!check.success) return 'field parity';
  const strings = allStrings(check.data);
  if (strings.some((s) => s.trim().length === 0)) return 'field parity';

  // 1b. Category coverage — s5/s6 only. Their payload is an array keyed to this section's own
  // category slice, and no other gate constrains it: gate 1's blank check is `.some()` over a
  // FLATTENED array and `[].some()` is false, so an empty array passes; the joined `text` is
  // then '', which vacuously satisfies gates 2/3/4/6; and s5/s6 are the only two AI sections
  // with `required_mentions: []` (report.yaml:69,78), so gate 3 has no content requirement here
  // either. Nothing downstream catches it: both renderers use `category_id` purely as a React
  // key. Without this check an empty section shipped as a passing AI section rendering nothing,
  // and a duplicated or cross-slice id shipped as prose about the wrong category.
  //
  // The known-id set is read straight off the registry slice rather than re-deriving
  // `categories.slice(0, 3)` / `.slice(3)` here: duplicating those boundaries would drift
  // silently the moment the registry changes.
  const coverageField = COVERAGE_FIELD[id];
  if (coverageField) {
    const entries = (check.data as Record<string, { category_id: string }[]>)[coverageField] ?? [];
    if (entries.length === 0) return 'category coverage';
    const known = new Set(
      (SECTION_REGISTRY[id].slice(ctx.facts) as { categories: CategoryFact[] }).categories.map((c) => c.id),
    );
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!known.has(entry.category_id) || seen.has(entry.category_id)) return 'category coverage';
      seen.add(entry.category_id);
    }
  }

  const text = strings.join(' ');
  const lower = text.toLowerCase();

  // 2. Scoped numeric containment — against THIS section's slice, not the whole pack. The pack
  // densely covers 0-100 with every score and percentile, so a global allowed set would let a
  // number migrate from one section's subject to another's. Same rationale as prose.ts:70-78.
  const allowed = new Set([SCALE_DENOMINATOR, ...extractNumbers(JSON.stringify(SECTION_REGISTRY[id].slice(ctx.facts)))]);
  for (const n of extractNumbers(text)) if (!allowed.has(n)) return 'numeric containment';

  // 3. Required and banned mentions.
  const required = ctx.methodology.report.sections[id].required_mentions;
  const resolved: Record<RequiredMention, string> = {
    tier_name: ctx.facts.overall.tier.name,
    primary_name: ctx.facts.primary_constraint?.name ?? '',
    overall_percent: String(ctx.facts.overall.capacity),
  };
  for (const key of required) {
    const needle = resolved[key];
    // Keyed by RequiredMention, so the compiler requires a resolver entry per enum member. An
    // absent primary constraint resolves to '', and includes('') is true — vacuously satisfied.
    if (!lower.includes(needle.toLowerCase())) return 'required mention';
  }
  if (ctx.facts.archetype === 'constraint' && ctx.facts.primary_constraint && (id === 's2' || id === 's4')) {
    if (!lower.includes(ctx.facts.primary_constraint.name.toLowerCase())) return 'required mention';
  }
  for (const phrase of ctx.methodology.report.banned_phrases[ctx.facts.archetype]) {
    if (lower.includes(phrase.toLowerCase())) return 'banned phrase';
  }
  // P1 register calibration: below the 70 tier boundary, a report must not reach for the
  // consolation register — banned_phrases.constraint's list ("healthy and ready to grow",
  // "nothing in your chain is broken", "this is a capacity conversation", "every stage is
  // strong"), despite that key naming the OTHER archetype (see gate 3's first loop above).
  // Guarded off for the capacity archetype (product owner ruling, fix round 1): a
  // capacity-archetype report scoring below 70 is REQUIRED to use exactly that register —
  // "Nothing in the chain is broken" is its own S2 template — so banning it here would be a
  // false rejection. For the constraint archetype this loop is already a harmless no-op (gate
  // 3's first loop reads the identical banned_phrases.constraint array and fires first), so
  // after this guard the loop does real, reachable work only for the foundation archetype,
  // which must not claim "every stage is strong" just because it scored under 70.
  if (ctx.facts.archetype !== 'capacity' && ctx.facts.overall.capacity < 70) {
    for (const phrase of ctx.methodology.report.banned_phrases.constraint) {
      if (lower.includes(phrase.toLowerCase())) return 'banned phrase';
    }
  }

  // 4. Anonymity — no respondent label anywhere in the section. Fail closed: the alternative is
  // a named individual on a rendered report.
  for (const label of ctx.labels) {
    if (label && lower.includes(label.toLowerCase())) return 'anonymity';
  }

  // 5. S7 pattern-claim consistency — a "none of these are X" claim is permitted only when the
  // computed bottom-6 theme counts make it true.
  if (id === 's7') {
    const claim = (check.data as { pattern_claim: string | null }).pattern_claim;
    if (claim) {
      const c = claim.toLowerCase();
      if (c.includes('none')) {
        for (const [theme, words] of Object.entries(THEME_WORDS)) {
          if (!words.some((w) => c.includes(w))) continue;
          if ((ctx.facts.pattern_counts[theme as keyof FactsPack['pattern_counts']] ?? 0) > 0) return 'pattern claim';
        }
      }
    }
  }

  // 6. Length ceiling — total rendered characters for this section.
  if (text.length > ctx.methodology.report.sections[id].length_ceiling) return 'length ceiling';

  return null;
}
