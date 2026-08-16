import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { roadmapEntries } from '@/lib/report/fallback-sections';
import { CAPACITY_FACTS } from '../fixtures/facts';

describe('roadmapEntries is exported for the web phase rail', () => {
  const methodology = loadMethodology();

  it('returns one {dayLabel, text} entry per populated phase', () => {
    const entries = roadmapEntries(CAPACITY_FACTS, methodology);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeLessThanOrEqual(3);
    for (const entry of entries) {
      expect(typeof entry.dayLabel).toBe('string');
      expect(typeof entry.text).toBe('string');
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it('is pure', () => {
    expect(roadmapEntries(CAPACITY_FACTS, methodology)).toEqual(
      roadmapEntries(CAPACITY_FACTS, methodology),
    );
  });
});
