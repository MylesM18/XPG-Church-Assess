import { describe, it, expect, vi, afterEach } from 'vitest';
import { summariseSectionSources } from '@/lib/report/compose';
import type { SectionId, SectionSource } from '@/lib/report/compose';

afterEach(() => { vi.restoreAllMocks(); });

function sources(over: Partial<Record<SectionId, SectionSource>>): Record<SectionId, SectionSource> {
  const ids: SectionId[] = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','appendix'];
  return Object.fromEntries(ids.map((id) => [id, over[id] ?? 'fallback'])) as Record<SectionId, SectionSource>;
}

describe('summariseSectionSources', () => {
  it('reports the ai count and names every fallback section', () => {
    const line = summariseSectionSources(sources({ s2: 'ai', s4: 'ai' }));
    expect(line).toContain('ai 2/13');
    expect(line).toContain('s6');
    expect(line).not.toContain('s2');
  });

  it('makes an all-fallback report unmistakable', () => {
    const line = summariseSectionSources(sources({}));
    expect(line).toContain('ai 0/13');
  });

  it('makes an all-ai report unmistakable and lists no fallbacks', () => {
    const all = sources({});
    for (const id of Object.keys(all) as SectionId[]) all[id] = 'ai';
    const line = summariseSectionSources(all);
    expect(line).toContain('ai 13/13');
    expect(line).toContain('fallback: none');
  });

  it('carries no church data — ids and counts only', () => {
    const line = summariseSectionSources(sources({ s2: 'ai' }));
    expect(line).toMatch(/^ai \d+\/\d+ · fallback: [a-z0-9, ]+$/);
  });
});

describe('composeSection warns once when the API key is absent', () => {
  it('logs a distinct key-absent warning, not a generic request failure', async () => {
    vi.resetModules();
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { composeSection } = await import('@/lib/ai/sections');
    const { loadMethodology } = await import('@/lib/methodology/load');
    const { CAPACITY_FACTS } = await import('../fixtures/facts');

    await composeSection('s2', CAPACITY_FACTS, loadMethodology());
    await composeSection('s4', CAPACITY_FACTS, loadMethodology());

    const keyWarnings = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('OPENAI_API_KEY'));
    expect(keyWarnings).toHaveLength(1);
    expect(keyWarnings[0]).toContain('[report]');

    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });
});
