import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');

const files = readdirSync('lib/ai', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

describe('AI prose never reads reflections', () => {
  it('finds the ai module', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s references neither reflection nor outreachVoices', (file) => {
    const src = stripTs(readFileSync(`lib/ai/${file}`, 'utf8'));
    expect(src).not.toContain('reflection');
    expect(src).not.toContain('outreachVoices');
  });
});
