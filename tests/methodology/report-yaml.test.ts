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

describe("report.yaml carries no retired engine jargon in reader-facing copy", () => {
  const sections = loadMethodology().report.sections;

  /**
   * Step F renamed the two headline numbers to "Health score" and "Real-world result" because
   * "capacity" and "throughput" are the ENGINE's words for them, not a church leader's, and
   * removed the /methodology entry that used to teach them. s4's capacity archetype template
   * still opened on the bare word, so the one place a reader still met it was the one place
   * nothing defined it any more.
   *
   * Scoped to `templates` on purpose: `capacity` is also the archetype KEY on every section
   * (a key, never rendered), and "Capacity & Next-Ceiling Session" in offers.yaml is a product
   * name, which is fine.
   */
  // The LABEL use — the bare word as its own sentence, which is how s4 opened. Not every
  // occurrence: s12's "building the capacity to steward what is coming" is the ordinary English
  // noun, in a sentence that never presents it as the name of a number, and step F did not
  // touch it.
  const LABEL_USE = /(^|\.\s+)(capacity|throughput)\.(\s|$)/i;

  it('never opens a sentence with the bare metric name', () => {
    const offenders: string[] = [];
    for (const id of SECTION_IDS) {
      for (const archetype of ARCHETYPES) {
        if (LABEL_USE.test(sections[id].templates[archetype])) offenders.push(`${id}.${archetype}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch the s4 regression it exists for', () => {
    // Non-vacuity: the exact string this test was written against must still fail the rule.
    expect(LABEL_USE.test('Capacity. Every stage is working, so what sits in front of you is a growth question.')).toBe(true);
    expect(LABEL_USE.test('The objective for the next ninety days is building the capacity to steward what is coming.')).toBe(false);
  });
});

describe("report.yaml s7 describes what s7 actually renders", () => {
  const s7 = loadMethodology().report.sections.s7;

  /**
   * s7 stopped being "the six lowest indicators" on 2026-08-19: it now leads with the
   * areas-needing-work punch list — EVERY area below the 80 standard, worst first, each with its
   * own questions (lib/report/blocks.ts) — and keeps the six lowest as its rank-list chart and
   * its pattern lines. A title naming only the six sat directly above eight area entries.
   *
   * These templates are also the model's per-archetype system prompt (composeSection), so they
   * have to stay true of the AI narrative as well: the model still writes about bottom_items,
   * which is why the six are asserted to SURVIVE here rather than be replaced.
   */
  it('names the areas below the standard in the title, not just the six lowest questions', () => {
    expect(s7.title.toLowerCase()).toMatch(/standard/);
  });

  it('still names the six lowest indicators in every archetype template', () => {
    const missing = ARCHETYPES.filter((a) => !s7.templates[a].toLowerCase().includes('six lowest'));
    expect(missing).toEqual([]);
  });

  it('names the areas below the standard in every archetype template too', () => {
    const missing = ARCHETYPES.filter((a) => !s7.templates[a].toLowerCase().includes('standard'));
    expect(missing).toEqual([]);
  });
});

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
