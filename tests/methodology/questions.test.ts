import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { QuestionsSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/questions.yaml', import.meta.url)), 'utf8');
const q = QuestionsSchema.parse(yaml.load(raw));

const EVIDENCE = new Set(['G1','G2','G4','G5','C2','C3','C5','D3','V1','V2','GEN1']);
const byId = Object.fromEntries(q.categories.map(c => [c.id, c])) as Record<string, any>;

describe('questions.yaml', () => {
  it('has 8 categories and 50 items', () => {
    expect(q.categories).toHaveLength(8);
    expect(q.categories.flatMap(c => c.items)).toHaveLength(50);
  });

  it('has the exact stage/enabler shape', () => {
    expect(q.categories.filter(c => c.kind === 'stage').map(c => c.id))
      .toEqual(['guest','conn','disc','vol','gen']);
    expect(q.categories.filter(c => c.kind === 'enabler').map(c => c.id))
      .toEqual(['gov','comm','sys']);
    expect(byId.guest.position).toBe(1);
    expect(byId.gen.position).toBe(5);
    for (const e of ['gov','comm','sys']) expect(byId[e].position).toBeNull();
  });

  it('tags exactly the agreed evidence items and nothing else', () => {
    for (const c of q.categories) {
      for (const it of c.items) {
        const expected = EVIDENCE.has(it.id) ? 'evidence' : 'belief';
        expect(`${it.id}:${it.signal}`).toBe(`${it.id}:${expected}`);
      }
    }
  });

  it('every anchor is non-empty and every item id is well-formed', () => {
    for (const c of q.categories) {
      for (const it of c.items) {
        expect(it.anchors.lo.length).toBeGreaterThan(0);
        expect(it.anchors.mid.length).toBeGreaterThan(0);
        expect(it.anchors.hi.length).toBeGreaterThan(0);
        expect(it.text.length).toBeGreaterThan(10);
      }
    }
  });

  it('spot-checks verbatim wording', () => {
    const g1 = byId.guest.items.find((i: any) => i.id === 'G1')!;
    expect(g1.text).toBe('When a first-time guest visits, what actually happens to their information?');
    expect(g1.anchors.lo).toBe("Nothing. We don't know who visited or how to reach them.");
    const gen1 = byId.gen.items.find((i: any) => i.id === 'GEN1')!;
    expect(gen1.anchors.hi).toBe('More than half of households give.');
  });
});
