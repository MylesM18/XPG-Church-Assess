import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { assembleFallbackOnly } from '@/lib/report/compose';
import { MIN_SUPPORT } from '@/lib/ai/theme-gates';
import { THEMES_N3_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();

describe('s8 theme path', () => {
  it('renders one bullet per theme with its label, gloss and support count', () => {
    const bullets = fallbackSection('s8', { facts: THEMES_N3_FACTS, methodology, reflections: [] }).bullets;
    expect(bullets).toHaveLength(THEMES_N3_FACTS.themes.length);
    for (const theme of THEMES_N3_FACTS.themes) {
      const line = bullets.find((b) => b.includes(theme.label));
      expect(line, theme.label).toBeDefined();
      expect(line!).toContain(theme.gloss);
      expect(line!).toContain(String(theme.support_count));
    }
  });

  it('never emits a verbatim quote into a bullet, even when the theme carries one', () => {
    const withVerbatims = makeFacts({
      themes: [{
        label: 'Nobody owns follow-up',
        gloss: 'Follow-up is described as everyone’s job.',
        support_count: 4,
        item_ids: ['S2'],
        verbatims: ['I assumed the other campus was calling them.'],
      }],
    });
    const bullets = fallbackSection('s8', { facts: withVerbatims, methodology, reflections: [] }).bullets;
    expect(bullets.join(' ')).not.toContain('I assumed the other campus');
  });

  it('every theme reaching a renderer clears MIN_SUPPORT', () => {
    for (const theme of THEMES_N3_FACTS.themes) {
      expect(theme.support_count).toBeGreaterThanOrEqual(MIN_SUPPORT);
    }
  });

  it('takes the theme branch over the reflection branch when both are available', () => {
    // G1 carries no `reflection:` field in methodology/questions.yaml, so buildOutreachVoices
    // could never surface it regardless of branch order (see tests/report/anonymity.test.ts's
    // identical note). G6 is a genuine reflection-prompted item — the only way this test can
    // actually fail if the branch order in s8Bullets (lib/report/fallback-sections.ts) inverts.
    const reflections = [{ item_id: 'G6', reflection: 'A raw reflection nobody clustered.' }];
    const bullets = fallbackSection('s8', { facts: THEMES_N3_FACTS, methodology, reflections }).bullets;
    expect(bullets.join(' ')).not.toContain('A raw reflection nobody clustered');
  });

  it('reaches the public share page too', () => {
    const s8 = assembleFallbackOnly({ facts: THEMES_N3_FACTS, methodology, reflections: [] })
      .find((s) => s.id === 's8')!;
    expect(s8.fallback.bullets.join(' ')).toContain(THEMES_N3_FACTS.themes[0]!.label);
  });
});
