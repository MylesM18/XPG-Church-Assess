import { describe, expect, it } from 'vitest';
import { indexReflections, reflectionWriterCount, type ReflectionRow } from '../../lib/ai/themes';

const rows: ReflectionRow[] = [
  { item_id: 'b1', respondent_key: 'p2', text: 'zebra' },
  { item_id: 'a1', respondent_key: 'p1', text: 'banana' },
  { item_id: 'a1', respondent_key: 'p3', text: 'apple' },
];

describe('indexReflections', () => {
  it('sorts by item_id then lexicographic text', () => {
    expect(indexReflections(rows).rows.map((r) => [r.item_id, r.text])).toEqual([
      ['a1', 'apple'],
      ['a1', 'banana'],
      ['b1', 'zebra'],
    ]);
  });

  it('assigns r1..rN in sorted order', () => {
    expect(indexReflections(rows).rows.map((r) => r.index)).toEqual(['r1', 'r2', 'r3']);
  });

  it('maps each index back to its respondent key, server-side', () => {
    const { owners } = indexReflections(rows);
    expect(owners.get('r1')).toBe('p3');
    expect(owners.get('r2')).toBe('p1');
    expect(owners.get('r3')).toBe('p2');
  });

  it('projects exactly index/item_id/text — the respondent key cannot ride along', () => {
    // This is the structural proof behind the whole anonymity design: the payload Task 6
    // sends is built from `rows`, and `rows` has no field that could carry identity. An
    // edit that serializes the ReflectionRow[] instead breaks this test.
    for (const r of indexReflections(rows).rows) {
      expect(Object.keys(r).sort()).toEqual(['index', 'item_id', 'text']);
    }
  });

  it('returns empty structures for empty input', () => {
    const { rows: out, owners } = indexReflections([]);
    expect(out).toEqual([]);
    expect(owners.size).toBe(0);
  });

  it('does not mutate the caller array', () => {
    const input = [...rows];
    indexReflections(input);
    expect(input[0]!.text).toBe('zebra');
  });
});

describe('reflectionWriterCount', () => {
  it('counts distinct respondent keys, not rows', () => {
    // P3's pool is distinct reflection-WRITERS. Three rows written by two people is a
    // pool of two, which is why this cannot be rows.length.
    expect(
      reflectionWriterCount([
        { item_id: 'a1', respondent_key: 'p1', text: 'x' },
        { item_id: 'a2', respondent_key: 'p1', text: 'y' },
        { item_id: 'a1', respondent_key: 'p2', text: 'z' },
      ]),
    ).toBe(2);
  });

  it('is 0 for no rows', () => {
    expect(reflectionWriterCount([])).toBe(0);
  });
});
