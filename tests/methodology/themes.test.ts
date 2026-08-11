import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { ItemSchema, ThemeSchema } from '../../lib/methodology/schema';

const m = loadMethodology();
const items = m.questions.categories.flatMap((c) => c.items);

// Canonical item → theme table (spec P2; Natalie spot-checks these tags at review).
const EXPECTED: Record<string, 'systems' | 'culture' | 'theology' | 'relational'> = {
  G1: 'systems', G2: 'systems', G3: 'systems', G4: 'systems', G5: 'systems', G6: 'systems', G7: 'culture',
  C1: 'relational', C2: 'relational', C3: 'relational', C4: 'systems', C5: 'culture', C6: 'culture',
  D1: 'systems', D2: 'culture', D3: 'systems', D4: 'theology', D5: 'systems', D6: 'theology',
  V1: 'culture', V2: 'systems', V3: 'systems', V4: 'systems', V5: 'culture', V6: 'culture',
  GEN1: 'culture', GEN2: 'theology', GEN3: 'culture', GEN4: 'systems', GEN5: 'systems', GEN6: 'systems',
  GOV1: 'systems', GOV2: 'systems', GOV3: 'culture', GOV4: 'systems', GOV5: 'systems', GOV6: 'systems',
  COM1: 'systems', COM2: 'systems', COM3: 'systems', COM4: 'systems', COM5: 'relational', COM6: 'relational', COM7: 'relational',
  SYS1: 'systems', SYS2: 'systems', SYS3: 'systems', SYS4: 'systems', SYS5: 'systems', SYS6: 'systems',
};

describe('item theme tags (spec P2)', () => {
  it('covers exactly the 50 items', () => {
    expect(items.length).toBe(50);
    expect(Object.keys(EXPECTED).sort()).toEqual(items.map((i) => i.id).sort());
  });
  it('every item carries its canonical theme', () => {
    for (const item of items) {
      expect(item.theme, `item ${item.id}`).toBe(EXPECTED[item.id]);
    }
  });
  it('tally matches the draft table: systems 31 · culture 10 · relational 6 · theology 3', () => {
    const tally: Record<string, number> = { systems: 0, culture: 0, theology: 0, relational: 0 };
    for (const item of items) tally[item.theme]! += 1;
    expect(tally).toEqual({ systems: 31, culture: 10, relational: 6, theology: 3 });
  });
  it('ThemeSchema is the closed four-value vocabulary', () => {
    expect(ThemeSchema.options).toEqual(['systems', 'culture', 'theology', 'relational']);
  });
  it('ItemSchema rejects an item without a theme', () => {
    const real = items[0]!;
    const stripped = { ...real } as Record<string, unknown>;
    delete stripped.theme;
    expect(ItemSchema.safeParse(stripped).success).toBe(false);
    expect(ItemSchema.safeParse(real).success).toBe(true);
  });
  it('no methodology version bump: tags are annotation only', () => {
    expect(m.questions.version).toBe('0.3.0');
  });
});
