import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { roadmapEntries } from '@/lib/report/fallback-sections';
import { webVisuals } from '@/lib/report/web-visuals';
import { CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

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

describe('webVisuals — s3 capacity bars', () => {
  const methodology = loadMethodology();

  it('mirrors overall and scales both bars on a shared 0-100 axis', () => {
    const { capacity } = webVisuals(CAPACITY_FACTS, methodology).s3;
    expect(capacity.capacity).toBe(CAPACITY_FACTS.overall.capacity);
    expect(capacity.throughput).toBe(CAPACITY_FACTS.overall.throughput);
    expect(capacity.gap).toBe(CAPACITY_FACTS.overall.gap);
    expect(capacity.capacityPct).toBeCloseTo(CAPACITY_FACTS.overall.capacity, 5);
    expect(capacity.throughputPct).toBeCloseTo(CAPACITY_FACTS.overall.throughput, 5);
    expect(capacity.band).toBe('broken');
  });

  it('prints the points-lost chip only when the gap is positive', () => {
    const positive = webVisuals(
      makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap: 19 } }),
      methodology,
    ).s3.capacity;
    expect(positive.gapLabel).toBe('19 POINTS LOST');

    for (const gap of [0, -3]) {
      const model = webVisuals(
        makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap } }),
        methodology,
      ).s3.capacity;
      expect(model.gapLabel).toBeNull();
    }
  });
});

describe('webVisuals — s13 confidence', () => {
  const methodology = loadMethodology();

  it('prints confidence as a whole percentage with the sample basis', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    expect(confidence.pct).toBe(Math.round(CAPACITY_FACTS.confidence * 100));
    expect(confidence.label).toBe(`${confidence.pct}%`);
    expect(confidence.respondents).toBe(CAPACITY_FACTS.cover.respondent_count);
    expect(confidence.areas).toBe(CAPACITY_FACTS.categories.length);
  });

  it('reports the thinnest coverage by area name and count', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    const min = Math.min(...CAPACITY_FACTS.categories.map((c) => c.respondent_count));
    expect(confidence.thinnest).not.toBeNull();
    expect(confidence.thinnest!.count).toBe(min);
    expect(CAPACITY_FACTS.categories.some(
      (c) => c.name === confidence.thinnest!.name && c.respondent_count === min,
    )).toBe(true);
  });

  it('has no thinnest row when there are no categories', () => {
    const model = webVisuals(makeFacts({ categories: [] }), methodology).s13.confidence;
    expect(model.thinnest).toBeNull();
    expect(model.areas).toBe(0);
  });
});

describe('webVisuals is pure', () => {
  const methodology = loadMethodology();

  it('returns deep-equal output for the same input', () => {
    expect(webVisuals(CAPACITY_FACTS, methodology)).toEqual(webVisuals(CAPACITY_FACTS, methodology));
  });
});
