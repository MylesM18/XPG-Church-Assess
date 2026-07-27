import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMethodology } from '../../lib/methodology/load';

describe('loadMethodology', () => {
  it('loads all five methodology files', () => {
    const m = loadMethodology();
    expect(m.questions.version).toBe('0.2.0');
    expect(m.rules.chain).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
    expect(m.offers.no_constraint.type).toBe('capacity');
    expect(Object.keys(m.copy.blocks).length).toBeGreaterThan(0);
  });

  it('throws with the file name when a file is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cairn-bad-'));
    writeFileSync(join(dir, 'questions.yaml'), 'version: 1\nnope: true\n');
    expect(() => loadMethodology(dir)).toThrow(/questions\.yaml/);
  });
});
