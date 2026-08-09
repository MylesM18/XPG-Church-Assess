import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync('methodology/questions.yaml', 'utf8');

const CATEGORIES = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

const PLACEMENT: Array<[string, string]> = [
  ['G6', 'guest'],
  ['G7', 'guest'],
  ['C6', 'conn'],
  ['D6', 'disc'],
  ['V6', 'vol'],
  ['GEN6', 'gen'],
  ['GOV6', 'gov'],
  ['COM6', 'comm'],
  ['COM7', 'comm'],
  ['SYS6', 'sys'],
];

// Category headers sit at 2-space indent (`  - id: guest`), items at 6
// (`      - id: G6`) — the indents keep the two namespaces distinct.
function categorySlice(categoryId: string): string {
  const start = yaml.indexOf(`  - id: ${categoryId}\n`);
  const nextId = CATEGORIES[CATEGORIES.indexOf(categoryId) + 1];
  const end = nextId ? yaml.indexOf(`  - id: ${nextId}\n`) : yaml.length;
  return yaml.slice(start, end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('questions.yaml 0.3.0 outreach items', () => {
  it('line 1 pins the version', () => {
    expect(yaml.split('\n')[0]).toBe('version: "0.3.0"');
  });

  it('every category header resolves', () => {
    for (const c of CATEGORIES) {
      expect(yaml.indexOf(`  - id: ${c}\n`), c).toBeGreaterThan(-1);
    }
  });

  it.each(PLACEMENT)('%s appears exactly once, inside %s', (itemId, categoryId) => {
    expect(count(yaml, `      - id: ${itemId}\n`)).toBe(1);
    expect(count(categorySlice(categoryId), `      - id: ${itemId}\n`)).toBe(1);
  });

  it('all 10 carry since 0.3.0 and a reflection prompt', () => {
    expect(count(yaml, 'since: "0.3.0"')).toBe(10);
    expect(count(yaml, 'reflection:')).toBe(10);
  });

  it('new items are appended at the END of their category', () => {
    const guest = categorySlice('guest');
    expect(guest.indexOf('- id: G5')).toBeLessThan(guest.indexOf('- id: G6'));
    expect(guest.indexOf('- id: G6')).toBeLessThan(guest.indexOf('- id: G7'));
    const comm = categorySlice('comm');
    expect(comm.indexOf('- id: COM5')).toBeLessThan(comm.indexOf('- id: COM6'));
    expect(comm.indexOf('- id: COM6')).toBeLessThan(comm.indexOf('- id: COM7'));
  });

  it('item counts: guest/comm 7, others 6', () => {
    const expected: Record<string, number> = {
      guest: 7, conn: 6, disc: 6, vol: 6, gen: 6, gov: 6, comm: 7, sys: 6,
    };
    for (const c of CATEGORIES) {
      expect(count(categorySlice(c), '      - id: '), c).toBe(expected[c]);
    }
  });
});
