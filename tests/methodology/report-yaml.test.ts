import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import { loadMethodology } from '@/lib/methodology/load';

const SECTION_IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12'] as const;
const ARCHETYPES = ['capacity','constraint','foundation'] as const;

const REAL_DIR = join(process.cwd(), 'methodology');
// All six loadMethodology reads except report.yaml, copied verbatim so the mutated report.yaml
// is the only thing that differs from a real load.
const OTHER_FILES = ['questions.yaml', 'rules.yaml', 'benchmarks.yaml', 'offers.yaml', 'copy.yaml'];

function dirWithMissingReportSection(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xpg-missing-report-section-'));
  for (const file of OTHER_FILES) {
    copyFileSync(join(REAL_DIR, file), join(dir, file));
  }
  const report = parseYaml(readFileSync(join(REAL_DIR, 'report.yaml'), 'utf8')) as {
    sections: Record<string, unknown>;
  };
  delete report.sections.s6;
  writeFileSync(join(dir, 'report.yaml'), dumpYaml(report));
  return dir;
}

describe('report.yaml', () => {
  const m = loadMethodology();

  it('loads and carries its own version', () => {
    expect(m.report.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('names all twelve sections', () => {
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

  // The named-key discipline (copy.yaml's, schema.ts:122-126) as a behaviour, exercised at the
  // real load boundary: a report.yaml missing a section must fail loadMethodology(dir) itself,
  // not merely a standalone ReportSchema.parse call the loader never reaches.
  it('fails to load when a section is missing from report.yaml', () => {
    const dir = dirWithMissingReportSection();
    try {
      expect(() => loadMethodology(dir)).toThrow(/report\.yaml failed validation/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
