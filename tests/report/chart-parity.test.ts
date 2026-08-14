import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadMethodology } from '@/lib/methodology/load';
import { assembleFallbackOnly } from '@/lib/report/compose';
import { ALL_FIXTURES } from '../fixtures/facts';

const methodology = loadMethodology();
const PDF_CHARTS = 'lib/report/pdf/charts.tsx';
const WEB_CHARTS = 'app/app/[churchId]/diagnosis/report/charts.tsx';

describe('chart renderer parity', () => {
  it('both renderers consume the SAME model object — geometry is never recomputed per surface', () => {
    for (const src of [PDF_CHARTS, WEB_CHARTS]) {
      const text = readFileSync(src, 'utf8');
      // The whole point of the seam: a renderer that calls a model builder is computing its own
      // geometry, and the two surfaces can then silently disagree.
      expect(text, src).not.toMatch(/areaBarsModel\s*\(|tierGaugeModel\s*\(|bottomItemsModel\s*\(/);
      expect(text, src).toMatch(/BAND_FILL/);
    }
  });

  it('the PDF renderer uses react-pdf SVG primitives and the web one does not import react-pdf', () => {
    expect(readFileSync(PDF_CHARTS, 'utf8')).toMatch(/from '@react-pdf\/renderer'/);
    expect(readFileSync(WEB_CHARTS, 'utf8')).not.toMatch(/@react-pdf\/renderer/);
  });

  it('both renderers handle all three chart kinds', () => {
    for (const src of [PDF_CHARTS, WEB_CHARTS]) {
      const text = readFileSync(src, 'utf8');
      for (const kind of ['area_bars', 'tier_gauge', 'bottom_items']) {
        expect(text, `${src} / ${kind}`).toContain(`'${kind}'`);
      }
      expect(text, src).toContain('_exhaustive');
    }
  });

  it('every chart a section carries has a kind both renderers switch on', () => {
    const known = new Set(['area_bars', 'tier_gauge', 'bottom_items']);
    for (const { name, facts } of ALL_FIXTURES) {
      for (const section of assembleFallbackOnly({ facts, methodology, reflections: [] })) {
        for (const chart of section.charts) {
          expect(known.has(chart.kind), `${name}/${section.id}`).toBe(true);
        }
      }
    }
  });

  it('both section renderers render section.charts', () => {
    expect(readFileSync('lib/report/pdf/document.tsx', 'utf8')).toContain('section.charts');
    expect(readFileSync('app/app/[churchId]/diagnosis/report/sections.tsx', 'utf8')).toContain('section.charts');
  });
});
