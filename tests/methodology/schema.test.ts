import { describe, it, expect } from 'vitest';
import { QuestionsSchema, RulesSchema } from '../../lib/methodology/schema';

const cat = (
  id: string,
  name: string,
  kind: 'stage' | 'enabler',
  position: number | null,
  itemId: string,
  signal: 'belief' | 'evidence',
) => ({
  id,
  name,
  kind,
  position,
  items: [{ id: itemId, text: 't', signal, anchors: { lo: 'a', mid: 'b', hi: 'c' } }],
});

const eightCategories = [
  cat('guest', 'Guest Experience', 'stage', 1, 'G1', 'evidence'),
  cat('conn', 'Connection', 'stage', 2, 'C1', 'belief'),
  cat('disc', 'Discipleship', 'stage', 3, 'D1', 'belief'),
  cat('vol', 'Volunteering', 'stage', 4, 'V1', 'belief'),
  cat('gen', 'Generosity', 'stage', 5, 'GEN1', 'evidence'),
  cat('gov', 'Governance', 'enabler', null, 'GOV1', 'belief'),
  cat('comm', 'Communication', 'enabler', null, 'COM1', 'belief'),
  cat('sys', 'Systems', 'enabler', null, 'SYS1', 'belief'),
];

describe('QuestionsSchema', () => {
  it('accepts a valid 8-category questions object', () => {
    const ok = { version: '0.1.0', categories: eightCategories };
    expect(() => QuestionsSchema.parse(ok)).not.toThrow();
  });

  it('rejects a questions object that is not exactly 8 categories', () => {
    const bad = { version: '0.1.0', categories: [eightCategories[0]] };
    expect(() => QuestionsSchema.parse(bad)).toThrow();
  });

  it('rejects an unknown signal tag', () => {
    const bad = {
      version: '0.1.0',
      categories: eightCategories.map((c, i) =>
        i === 0
          ? { ...c, items: [{ ...c.items[0], signal: 'vibe' }] }
          : c,
      ),
    };
    expect(() => QuestionsSchema.parse(bad)).toThrow();
  });
});

describe('RulesSchema', () => {
  it('rejects thresholds missing a field', () => {
    expect(() => RulesSchema.parse({ version: '0.1.0' })).toThrow();
  });
});
