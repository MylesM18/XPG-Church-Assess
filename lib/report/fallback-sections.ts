import { MIN_SUPPORT } from '../ai/theme-gates';
import type { CategoryState } from '../engine/types';
import type { Methodology, Offer, SectionId, Theme } from '../methodology/schema';
import type { CategoryFact, FactsPack } from './facts';
import { buildOutreachVoices, interp, readingBand } from './view';

/**
 * The deterministic spine. Every one of the thirteen sections renders from the facts pack and
 * report.yaml alone — no model, no network, no throw. This is what makes an AI section failure
 * a local, invisible degradation rather than a broken report, and it is the ONLY renderer the
 * share page will ever reach (P5).
 *
 * Absorbs the old 10 blocks per the parent spec line 74:
 *   verdict → S2/S4 · evidence → S4/S7 · cost + do_not_work_on → S9/S10 (Constraint)
 *   next_step → S11 · gating → S6/S9 (Foundation) · dispersion → S6 area beat
 *   blind_spot → S6 "watch for" beat · benchmark_note + dependency_note → appendix
 */
export interface FallbackSectionArgs {
  facts: FactsPack;
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
}

export interface SectionBody {
  title: string;
  body: string;
  bullets: string[];
}

/** Settings-form labels for the 12 profile keys (app/app/[churchId]/settings/settings-form.tsx). */
const PROFILE_LABELS: Record<string, string> = {
  context: 'Context',
  attendance_band: 'Weekend attendance (required)',
  denomination: 'Denomination',
  adults_band: 'Adults',
  staff_fte_band: 'Staff (FTE)',
  budget_band: 'Annual budget',
  church_age_band: 'Church age',
  campuses_band: 'Campuses',
  growth_trajectory: 'Growth trajectory',
  facility_status: 'Facility',
  leadership_history: 'Leadership history',
  consultant_notes: 'Consultant notes',
};

type Phase = 'align' | 'build' | 'scale';
const PHASES: readonly Phase[] = ['align', 'build', 'scale'];
const DAY_LABELS: Record<Phase, string> = { align: '30 days', build: '60 days', scale: '90 days' };

/** S3's dashboard line + S6's "affirm" beat: the same band-thresholds view.ts already applies,
 *  via the now-exported readingBand (ruling 9) rather than a second, drift-prone copy. */
function bandRead(c: CategoryFact, methodology: Methodology): string {
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
  return methodology.copy.dossier.reading[c.kind][band];
}

/** S6's "evidence" beat: the blind-spot line (copy.blocks.blind_spot) when this area is one of
 *  the facts pack's blind spots, else a plain score line. Never throws — c.id simply won't be
 *  found in facts.blind_spots for most areas, which is the expected, non-error path. */
function evidenceBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const bs = facts.blind_spots.find((b) => b.category_id === c.id);
  if (bs) {
    return interp(methodology.copy.blocks.blind_spot!, {
      bs_name: bs.name,
      bs_belief: String(bs.belief),
      bs_evidence: String(bs.evidence),
      bs_gap: String(bs.gap),
    });
  }
  return `${c.name}: ${c.score} out of 100.`;
}

/** S6's "reframe" beat: the dispersion line — under `copy.inserts.dispersion`, NOT
 *  `copy.blocks.dispersion` (ruling 3 / recon divergence #3). Dropped entirely (returns null)
 *  when this area has no disagreement flag, per "absent inputs drop their beat". */
function reframeBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const d = facts.dispersion.find((dd) => dd.category_id === c.id);
  if (!d) return null;
  return interp(methodology.copy.inserts.dispersion!, {
    disp_name: d.name,
    disp_spread: String(d.spread),
  });
}

/**
 * S6's "pivot" beat: where this area sits relative to the church's own top three.
 *
 * facts.categories is already sorted score desc (ties by id asc, buildFacts:164), so rank is
 * just the index + 1 and the top three are slice(0, 3) — the SAME three s5 renders as strengths.
 * Returns null for those three: an area cannot pivot against a group it belongs to, and "0 points
 * behind your strongest three" is the empty sentence this beat design forbids.
 */
function pivotBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const rank = facts.categories.findIndex((cc) => cc.id === c.id) + 1;
  if (rank <= 3) return null;
  const topThree = facts.categories.slice(0, 3);
  if (topThree.length === 0) return null;
  const topMean = topThree.reduce((sum, cc) => sum + cc.score, 0) / topThree.length;
  const delta = Math.round(topMean - c.score);
  if (delta <= 0) return null;
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
  return interp(methodology.copy.beats.pivot[band], { rank: String(rank), delta: String(delta) });
}

/**
 * S6's "not-statement" beat: what this area's weakness is NOT, keyed by the dominant theme among
 * its own lowest-scoring indicators (facts.bottom_items, already the global bottom 6). An area
 * with none of them in the bottom 6 has no measured evidence of what its weakness is made of, so
 * the beat drops rather than guessing.
 *
 * Ties break by theme name ascending — deterministic, never localeCompare, because two runs of
 * the same report must produce byte-identical prose.
 */
function notStatementBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const mine = facts.bottom_items.filter((b) => b.category_id === c.id);
  if (mine.length === 0) return null;
  const counts = new Map<Theme, number>();
  for (const b of mine) counts.set(b.theme, (counts.get(b.theme) ?? 0) + 1);
  const dominant = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0]![0];
  return methodology.copy.beats.not_statement[dominant] ?? null;
}

/**
 * S6's "trajectory" beat: the area read against where the church as a whole is heading.
 *
 * facts.profile carries NON-NULL fields only (facts.ts:173-190), so an unset growth_trajectory is
 * simply absent from the record — and an unrecognised value (an older row, a vocabulary change in
 * the migration CHECK) resolves to undefined in the z.record lookup. Both drop the beat. Neither
 * throws, and neither emits a sentence about a trajectory nobody stated.
 */
function trajectoryBeat(facts: FactsPack, methodology: Methodology): string | null {
  const trajectory = facts.profile.growth_trajectory;
  if (!trajectory) return null;
  return methodology.copy.beats.trajectory[trajectory] ?? null;
}

/**
 * S6's per-area bullet: the full six-beat micro-template, joined by a space, in blueprint order —
 * affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory.
 *
 * pivot, not_statement and trajectory were previously omitted as "structurally absent": they had
 * no lookup anywhere in the facts pack or copy.yaml. They now do (copy.beats.*, plus
 * facts.categories ranking, facts.bottom_items themes and facts.profile.growth_trajectory
 * respectively), so all six are live.
 *
 * The original rule is unchanged and load-bearing: AN ABSENT INPUT DROPS ITS BEAT. Every beat
 * function returns string | null, the filter below removes the nulls, and no beat ever emits an
 * empty sentence or throws on an undefined lookup. affirm always resolves (readingBand never
 * fails to produce a band), so this bullet is never empty — the invariant s6's renderers and
 * gate 1's blank check both rely on.
 */
function s6Bullet(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const beats = [
    bandRead(c, methodology),
    pivotBeat(c, facts, methodology),
    evidenceBeat(c, facts, methodology),
    notStatementBeat(c, facts, methodology),
    reframeBeat(c, facts, methodology),
    trajectoryBeat(facts, methodology),
  ];
  return beats.filter((b): b is string => !!b).join(' ');
}

function s7Bullets(facts: FactsPack): string[] {
  const itemLines = facts.bottom_items.map((b) => `${b.text} — ${b.mean} out of 100 (${b.theme}).`);
  const patternLines = Object.entries(facts.pattern_counts)
    .filter(([, count]) => count === 0)
    .map(([theme]) => `None of the six lowest indicators are ${theme}.`);
  return [...itemLines, ...patternLines];
}

/**
 * S8's bullets, with the SAME k>=3 philosophy on both paths.
 *
 * The theme path already enforces it: clusterThemes -> theme-gates drops any cluster under
 * MIN_SUPPORT distinct supporting respondents, so facts.themes is k-safe by construction.
 *
 * The fallback path did NOT. It printed every reflection verbatim with its prompt and no
 * threshold at all — and this is the path the PUBLIC SHARE PAGE always renders
 * (assembleFallbackOnly). At one respondent that is one person's answers, fully attributable, on
 * a link anyone can forward.
 *
 * ⚠️ KNOWN LIMITATION, deliberate: `reflections` here is the KEYLESS array (item_id + text, no
 * respondent id — resolve.ts:24-28), so this cannot count distinct WRITERS the way theme-gates
 * does. It uses the run's distinct respondent count instead. That is a weaker k, but threading
 * respondent identity into a renderer to strengthen it is exactly what the keyless array exists
 * to prevent. Strictly better than no threshold; not as strong as the theme path's.
 */
function s8Bullets(
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
): string[] {
  if (facts.themes.length > 0) {
    return facts.themes.map((t) => `${t.label}: ${t.gloss} (${t.support_count} people).`);
  }
  if (facts.cover.respondent_count < MIN_SUPPORT) return [methodology.copy.s8_below_threshold];
  // buildOutreachVoices groups per category_id (Map<string, OutreachVoicesGroup[]>) — flatten
  // across the Map's values before producing lines (ruling 10). Verbatims never enter a
  // bullet: only group.entries (respondent free text), never facts.themes[].verbatims.
  const voices = buildOutreachVoices(methodology, [...reflections]);
  const lines = [...voices.values()]
    .flat()
    .flatMap((group) => group.entries.map((entry) => `${group.reflectionPrompt}: ${entry}`));
  // An empty section under a "What Leaders Are Saying" heading reads as a rendering bug. Say why
  // it is empty instead.
  return lines.length > 0 ? lines : [methodology.copy.s8_below_threshold];
}

function s9Bullets(facts: FactsPack): string[] {
  return [
    ...facts.dependencies.map((d) => d.read_sentence),
    ...facts.gating.map((g) => `${g.name}: ${g.note}`),
  ];
}

/**
 * S10's roadmap skeleton: one { dayLabel, text } entry per phase (constraint, capacity) or per
 * (phase, gated enabler) pair (foundation — Natalie's ruling 8: 2 gated enablers ⇒ 6 entries, 3
 * ⇒ 9). `text` is used by S10 only — S11 does NOT mirror this list's raw cardinality; see
 * s11Bullets's own doc comment below for ruling 11-REVISED (the withdrawn per-bullet ruling 11
 * mirrored every entry here 1:1, which produced byte-identical duplicate S11 bullets whenever an
 * archetype had more than one roadmap entry per phase — e.g. a 2-gated-enabler foundation).
 *
 * RULING 7 — the highest-risk lookup in this file: report.yaml carries BOTH
 * `action_library.categories.{gov,comm,sys}` and `action_library.enablers.{gov,comm,sys}`
 * with DIFFERENT text for the same ids. The constraint path below reads
 * `action_library.categories[primary]` (confirmed against report.yaml: e.g. `categories.gov.align`
 * = "Write down who decides what..."). The foundation path reads
 * `action_library.enablers[enabler_id]` (confirmed: `enablers.gov.align` =
 * "Clarify decision rights before adding any new initiative..." — different text, same key).
 * Picking the wrong bucket would still typecheck and still pass a test that only checks bullet
 * *count* — see tests/report/fallback-sections.test.ts's dedicated "action_library path" checks,
 * which assert the exact enabler text against report.yaml, not just presence.
 */
function roadmapEntries(facts: FactsPack, methodology: Methodology): Array<{ dayLabel: string; text: string }> {
  const lib = methodology.report.action_library;
  const entries: Array<{ dayLabel: string; text: string }> = [];

  if (facts.archetype === 'constraint' && facts.primary_constraint) {
    // Constraint path: action_library.categories[...], never .enablers[...].
    const set = lib.categories[facts.primary_constraint.category_id];
    for (const phase of PHASES) {
      const text = set?.[phase];
      if (text) entries.push({ dayLabel: DAY_LABELS[phase], text });
    }
  } else if (facts.archetype === 'foundation') {
    // Foundation / gated-enabler path: action_library.enablers[...], never .categories[...].
    // One bullet per gated enabler per phase (Natalie's ruling 8) — outer loop is phase, per
    // the brief's "for each phase ... pick ... each gated enabler's entry" ordering.
    for (const phase of PHASES) {
      for (const g of facts.gating) {
        const set = lib.enablers[g.enabler_id];
        const text = set?.[phase];
        if (text) entries.push({ dayLabel: DAY_LABELS[phase], text });
      }
    }
  } else {
    // Capacity path (and, structurally, any archetype that reaches here with no primary and no
    // gating): the generosity entry, keyed by facts.generosity_mode, falling back to 'both'
    // when null (Natalie's ruling 6) — never drop the bullet.
    const mode = facts.generosity_mode ?? 'both';
    const set = lib.generosity[mode];
    for (const phase of PHASES) {
      entries.push({ dayLabel: DAY_LABELS[phase], text: set[phase] });
    }
  }

  return entries;
}

function s10Bullets(facts: FactsPack, methodology: Methodology): string[] {
  const bullets = roadmapEntries(facts, methodology).map((e) => `${e.dayLabel} — ${e.text}`);
  if (facts.archetype === 'constraint' && facts.primary_constraint) {
    const primaryId = facts.primary_constraint.category_id;
    const names = facts.dependencies.filter((d) => d.from === primaryId).map((d) => d.to_name);
    if (names.length > 0) bullets.push(`Do not work on yet: ${names.join(', ')}.`);
  }
  return bullets;
}

/**
 * S11's single, archetype-level offer (reused for every mirrored bullet — see s11Bullets below).
 *
 * - primary === 'gen' → offers.generosity[mode] (Natalie's ruling 4 — offers.stages has no
 *   'gen' key), mode falling back to 'both' when null (ruling 6, applies here too).
 * - primary is any other chain stage → offers.stages[primary] (always resolves: guest/conn/
 *   disc/vol are exactly offers.stages' four keys).
 * - foundation (no primary constraint, gated enablers instead) → offers.foundation
 *   (Natalie's ruling 12 — a dedicated purpose-built offer, added specifically because
 *   offers.no_constraint's hook, "Nothing here is broken...", contradicts the report's own
 *   gating finding. This SUPERSEDES the earlier inferred decision to reuse offers.no_constraint
 *   for foundation, which task-5-report.md flagged and Natalie ruled on).
 * - capacity (no primary constraint, no gating either) → offers.no_constraint (ruling 5,
 *   unchanged — this is the one archetype that entry was always meant for).
 */
function offerFor(facts: FactsPack, methodology: Methodology): Offer {
  const primaryId = facts.primary_constraint?.category_id ?? null;
  if (primaryId === 'gen') {
    const mode = facts.generosity_mode ?? 'both';
    return methodology.offers.generosity[mode];
  }
  if (primaryId) {
    return methodology.offers.stages[primaryId] ?? methodology.offers.no_constraint;
  }
  if (facts.archetype === 'foundation') {
    return methodology.offers.foundation;
  }
  return methodology.offers.no_constraint;
}

/**
 * RULING 11-REVISED (binding, supersedes the withdrawn per-bullet ruling 11 — see
 * task-5-report.md's fix-round-1 addendum for the full reasoning): the brief's S11 row reads
 * "One bullet per S10 phase, mirroring it 1:1" — its primary clause is PER PHASE, and there are
 * always exactly three phases (align/build/scale → 30/60/90 days). "Mirrors 1:1" means 1:1 with
 * S10's distinct PHASES, never with S10's raw entry count (which varies with gated-enabler
 * count under Natalie's ruling 8 — S10 itself is unchanged).
 *
 * So: one bullet per DISTINCT dayLabel present in roadmapEntries (deduplicated, phase order
 * preserved via Set's insertion-order semantics), each paired with the single archetype-level
 * offer from offerFor() above. Concretely: constraint and capacity already produce exactly one
 * roadmap entry per phase, so S11 has 3 bullets, all distinct (different day label, same offer
 * text is fine — the day label makes each bullet unique). Foundation collapses N gated
 * enablers' worth of same-phase entries down to that phase's single distinct day label, so a
 * 2-gated-enabler foundation still yields 3 S11 bullets, not 6 — never a byte-identical
 * duplicate pair, which is exactly the defect the withdrawn ruling 11 produced.
 */
function s11Bullets(facts: FactsPack, methodology: Methodology): string[] {
  const offer = offerFor(facts, methodology);
  const offerText = `${offer.call_type} — ${offer.hook}`;
  const dayLabels = [...new Set(roadmapEntries(facts, methodology).map((e) => e.dayLabel))];
  return dayLabels.map((dayLabel) => `${dayLabel}: ${offerText}`);
}

function appendixBullets(facts: FactsPack, methodology: Methodology): string[] {
  const bullets = [
    methodology.copy.inserts.benchmark_note!,
    methodology.copy.inserts.dependency_note!,
    `Confidence: ${facts.confidence}.`,
  ];
  if (facts.cover.respondent_count < 8) {
    bullets.push(`Small sample: ${facts.cover.respondent_count} respondents.`);
  }
  return bullets;
}

function bulletsFor(
  id: SectionId,
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
  tokens: Record<string, string>,
): string[] {
  switch (id) {
    case 's1':
      return [];
    case 's2':
      return Object.entries(facts.profile).map(([k, v]) => `${PROFILE_LABELS[k] ?? k}: ${v}`);
    case 's3':
      // ONE bullet, not eight. The eight `Name: score — bandRead` lines this used to emit are
      // now the statGridModel chart (lib/report/charts.ts) on both surfaces, with the bar fill
      // keyed to the same corrected readingBand — printing them again beside the chart is the
      // same data twice. What the chart cannot say is what the shape MEANS, which is this line.
      return [methodology.copy.xpg_read[facts.archetype][facts.overall.tier.id]];
    case 's4':
      return [];
    case 's5':
      return facts.categories.slice(0, 3).map((c) => `XPG Assessment: ${c.name} — ${c.score} out of 100.`);
    case 's6':
      return facts.categories.slice(3).map((c) => s6Bullet(c, facts, methodology));
    case 's7':
      return s7Bullets(facts);
    case 's8':
      return s8Bullets(facts, methodology, reflections);
    case 's9':
      return s9Bullets(facts);
    case 's10':
      return s10Bullets(facts, methodology);
    case 's11':
      return s11Bullets(facts, methodology);
    case 's12':
      return [
        `Overall: ${facts.overall.capacity} out of 100.`,
        `Band: ${facts.overall.tier.name}.`,
        `Objective: ${tokens.primary_name}.`,
      ];
    case 'appendix':
      return appendixBullets(facts, methodology);
  }
}

export function fallbackSection(id: SectionId, args: FallbackSectionArgs): SectionBody {
  const { facts, methodology, reflections } = args;
  const section = methodology.report.sections[id];

  const tokens: Record<string, string> = {
    church_name: facts.cover.church_name,
    completed_at: facts.cover.completed_at ?? 'not yet completed',
    respondent_count: String(facts.cover.respondent_count),
    respondent_phrase: `${facts.cover.respondent_count} ${facts.cover.respondent_count === 1 ? 'respondent' : 'respondents'}`,
    overall_percent: String(facts.overall.capacity),
    tier_name: facts.overall.tier.name,
    primary_name: facts.primary_constraint?.name ?? 'no single stage',
    primary_score: String(
      facts.categories.find((c) => c.id === facts.primary_constraint?.category_id)?.score ?? 0,
    ),
  };

  return {
    title: section.title,
    body: interp(section.templates[facts.archetype], tokens),
    bullets: bulletsFor(id, facts, methodology, reflections, tokens),
  };
}

export function fallbackSections(args: FallbackSectionArgs): Record<SectionId, SectionBody> {
  const ids = Object.keys(args.methodology.report.sections) as SectionId[];
  return Object.fromEntries(ids.map((id) => [id, fallbackSection(id, args)])) as Record<SectionId, SectionBody>;
}
