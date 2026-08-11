import { describe, expect, it } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { ReportSchema } from '@/lib/methodology/schema';

const SECTION_IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','appendix'] as const;
const ARCHETYPES = ['capacity','constraint','foundation'] as const;

describe('report.yaml', () => {
  const m = loadMethodology();

  it('loads and carries its own version', () => {
    expect(m.report.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('names all thirteen sections', () => {
    expect(Object.keys(m.report.sections).sort()).toEqual([...SECTION_IDS].sort());
  });

  it('gives every section a template for every archetype', () => {
    for (const id of SECTION_IDS) {
      for (const a of ARCHETYPES) {
        expect(m.report.sections[id].templates[a].length, `${id}/${a}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries a banned-phrase list per archetype', () => {
    for (const a of ARCHETYPES) expect(m.report.banned_phrases[a].length).toBeGreaterThan(0);
  });

  // The named-key discipline (copy.yaml's, schema.ts:122-126) as a behaviour, not a shape:
  // a missing section must fail at LOAD, not as an `undefined` interpolated into a report.
  it('fails to load when a section is missing', () => {
    const { sections, ...rest } = ReportSchema.parse(m.report) as never as { sections: Record<string, unknown> };
    const { s6: _dropped, ...withoutS6 } = sections;
    expect(() => ReportSchema.parse({ ...rest, sections: withoutS6 })).toThrow();
  });

  // Stronger than named keys, and self-syncing: the action library must cover every category
  // and enabler the methodology actually defines, so adding an area cannot silently ship a
  // roadmap with a hole in it.
  it('covers every category and enabler in the action library', () => {
    for (const c of m.questions.categories) {
      expect(m.report.action_library.categories[c.id], `category ${c.id}`).toBeDefined();
    }
    for (const e of Object.keys(m.rules.enablers)) {
      expect(m.report.action_library.enablers[e], `enabler ${e}`).toBeDefined();
    }
  });
});
