import { describe, expect, it } from 'vitest';
import { punchListBlock, WEAK_ITEMS_SHOWN } from '@/lib/report/blocks';
import { blocksForSection } from '@/lib/report/compose';
import { CAPACITY_FACTS, FULL_ITEM_MAP_FACTS, makeFacts } from '../fixtures/facts';
import type { SectionId } from '@/lib/methodology/schema';

/**
 * The punch list (lib/report/blocks.ts). These assertions were `fallback.bullets` assertions
 * for one session and covered nothing that shipped: s7 is an AI section, so both renderers
 * dropped the bullets on every live report. The guarantees are unchanged — every area below the
 * standard, worst first, each over its OWN evidence — only their home is.
 */

describe('punchListBlock', () => {
  const facts = CAPACITY_FACTS;

  it('emits one entry per area below the standard, worst area first', () => {
    const expected = facts.improvement.areas_needing_work;
    expect(expected).toHaveLength(8); // fixture guard: the ruling is "all eight", not a worst-N cap
    const block = punchListBlock(facts)!;
    expect(block.areas.map((a) => a.category_id)).toEqual(expected.map((a) => a.category_id));
    expect(expected.map((a) => a.score)).toEqual([...expected.map((a) => a.score)].sort((x, y) => x - y));
  });

  it('gives each area its score and its gap to the standard, in one shared sentence', () => {
    const worst = facts.improvement.areas_needing_work[0]!;
    const head = punchListBlock(facts)!.areas[0]!.head;
    expect(head).toContain(worst.name);
    expect(head).toContain(`${worst.score} out of 100`);
    expect(head).toContain(`${worst.gap_to_standard} points below the standard of ${facts.improvement.standard}`);
  });

  it("carries an area's own weak questions and no other area's", () => {
    const areas = facts.improvement.areas_needing_work;
    const withItems = areas.filter((a) => a.weak_items.length > 0);
    expect(withItems.length).toBeGreaterThan(1); // guard: otherwise "no other area's" is vacuous
    const block = punchListBlock(facts)!;
    for (const [i, area] of areas.entries()) {
      const rendered = block.areas[i]!;
      const joined = rendered.items.map((x) => x.line).join(' ');
      for (const item of area.weak_items.slice(0, WEAK_ITEMS_SHOWN)) {
        expect(joined).toContain(item.text);
        expect(joined).toContain(`${item.mean} out of 100`);
      }
      for (const other of areas) {
        if (other.category_id === area.category_id) continue;
        for (const item of other.weak_items) expect(joined).not.toContain(item.text);
      }
    }
  });

  it('says so plainly when an area is below the standard with no question below it', () => {
    const bare = facts.improvement.areas_needing_work.filter((a) => a.weak_items.length === 0);
    expect(bare.length).toBeGreaterThan(0); // fixture guard
    const block = punchListBlock(facts)!;
    for (const area of bare) {
      const rendered = block.areas.find((a) => a.category_id === area.category_id)!;
      expect(rendered.items).toEqual([]);
      expect(rendered.note).toBe('No individual question in this area is below the standard.');
    }
  });

  it('carries its own lead line, so the section does not depend on AI prose to introduce it', () => {
    // s7's report.yaml template is BOTH the model's system prompt and the fallback body, and the
    // s7 AI slice carries no `improvement` — so the template cannot describe this list without
    // instructing the model to write about facts it was never given (and about the number 80,
    // which gate 2's numeric containment would then reject). The list introduces itself.
    const block = punchListBlock(facts)!;
    expect(block.heading).toBe(`Every area below the standard of ${facts.improvement.standard}, weakest first.`);
  });

  it('is null when nothing is below the standard, so s7 keeps its own bullets', () => {
    const healthy = makeFacts({ categories: CAPACITY_FACTS.categories.map((c) => ({ ...c, score: 85 })) });
    expect(healthy.improvement.areas_needing_work).toEqual([]); // fixture guard
    expect(punchListBlock(healthy)).toBeNull();
  });
});

/**
 * Volume. The fixtures that predate FULL_ITEM_MAP_FACTS derive `improvement` from their own six
 * `bottom_items`, so no rendering test ever saw more than a couple of weak questions per area.
 * Against the real 50-question instrument a church in the 50s and 60s puts nearly every question
 * below 80 — ~44 across eight areas — which is what this fixture reproduces.
 */
describe('punchListBlock at production volume', () => {
  const facts = FULL_ITEM_MAP_FACTS;

  it('fixture guard: at least one area carries more weak questions than the list prints', () => {
    const over = facts.improvement.areas_needing_work.filter((a) => a.weak_items.length > WEAK_ITEMS_SHOWN);
    expect(over.length).toBeGreaterThan(0);
  });

  it('prints at most WEAK_ITEMS_SHOWN questions per area', () => {
    const block = punchListBlock(facts)!;
    const overflowing = block.areas.filter((a) => a.items.length > WEAK_ITEMS_SHOWN);
    expect(overflowing.map((a) => a.category_id)).toEqual([]);
  });

  it('prints the WORST questions, not an arbitrary slice', () => {
    const block = punchListBlock(facts)!;
    for (const area of facts.improvement.areas_needing_work) {
      const rendered = block.areas.find((a) => a.category_id === area.category_id)!;
      expect(rendered.items.map((i) => i.item_id)).toEqual(
        area.weak_items.slice(0, WEAK_ITEMS_SHOWN).map((i) => i.item_id),
      );
    }
  });

  it('states how many questions it did not print, and never hides them silently', () => {
    const block = punchListBlock(facts)!;
    const checked: string[] = [];
    for (const area of facts.improvement.areas_needing_work) {
      const hidden = area.weak_items.length - WEAK_ITEMS_SHOWN;
      if (hidden <= 0) continue;
      const rendered = block.areas.find((a) => a.category_id === area.category_id)!;
      expect(rendered.note).toBe(`And ${hidden} more questions in this area below the standard.`);
      checked.push(area.category_id);
    }
    expect(checked.length).toBeGreaterThan(0); // guard: otherwise every assertion above was skipped
  });

  it('carries no note at all for an area whose weak questions all fit', () => {
    const fits = facts.improvement.areas_needing_work.filter(
      (a) => a.weak_items.length > 0 && a.weak_items.length <= WEAK_ITEMS_SHOWN,
    );
    const block = punchListBlock(facts)!;
    for (const area of fits) {
      expect(block.areas.find((a) => a.category_id === area.category_id)!.note).toBeNull();
    }
  });

  it('is materially shorter than printing every weak question', () => {
    const block = punchListBlock(facts)!;
    const chars = block.areas.reduce(
      (n, a) => n + a.head.length + a.items.reduce((m, i) => m + i.line.length, 0) + (a.note?.length ?? 0),
      0,
    );
    // What the uncapped form would cost on this same pack, measured the same way. The review's
    // estimate against a real 50s-60s church was ~6,100 characters across eight run-on
    // sentences; this fixture reproduces 5,643 of them. s7's own AI ceiling is 1,200 for scale.
    const uncapped = facts.improvement.areas_needing_work.reduce(
      (n, a) =>
        n +
        `${a.name} — ${a.score} out of 100, ${a.gap_to_standard} points below the standard of 80.`.length +
        a.weak_items.reduce((m, i) => m + `${i.text} — ${i.mean} out of 100 (${i.theme})`.length, 0),
      0,
    );
    expect(uncapped).toBeGreaterThan(5000); // guard: otherwise the ratio below proves nothing
    expect(chars).toBeLessThan(uncapped * 0.7);
    expect(chars).toBeLessThan(4000);
  });
});

describe('punchListBlock overflow wording', () => {
  /** One area with exactly WEAK_ITEMS_SHOWN + 1 sub-standard questions — the only shape that
   *  reaches the singular arm. FULL_ITEM_MAP_FACTS hides 2, 3 and 4, never 1. */
  const oneHidden = () => {
    const worstId = CAPACITY_FACTS.categories[CAPACITY_FACTS.categories.length - 1]!.id;
    const items = [40, 45, 50, 55].map((mean, i) => ({
      item_id: `X${i + 1}`,
      category_id: worstId,
      mean,
      text: `Question ${i + 1} in the weakest area.`,
      theme: 'systems' as const,
    }));
    return makeFacts({ bottom_items: items }, items);
  };

  it('fixture guard: exactly one question goes unprinted', () => {
    const area = oneHidden().improvement.areas_needing_work.find((a) => a.weak_items.length === 4)!;
    expect(area.weak_items.length - WEAK_ITEMS_SHOWN).toBe(1);
  });

  it('says "question", not "questions", when exactly one is unprinted', () => {
    const facts = oneHidden();
    const area = facts.improvement.areas_needing_work.find((a) => a.weak_items.length === 4)!;
    const rendered = punchListBlock(facts)!.areas.find((a) => a.category_id === area.category_id)!;
    expect(rendered.note).toBe('And 1 more question in this area below the standard.');
  });
});

describe('blocksForSection', () => {
  it('attaches the punch list to s7 and to nothing else', () => {
    const withBlocks = (['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'] as SectionId[])
      .filter((id) => blocksForSection(id, CAPACITY_FACTS).length > 0);
    expect(withBlocks).toEqual(['s7']);
  });

  it('attaches nothing to s7 when no area is below the standard', () => {
    const healthy = makeFacts({ categories: CAPACITY_FACTS.categories.map((c) => ({ ...c, score: 85 })) });
    expect(blocksForSection('s7', healthy)).toEqual([]);
  });
});
