import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import { loadMethodology } from '../../lib/methodology/load';

const REAL_DIR = join(process.cwd(), 'methodology');
const OTHER_FILES = ['questions.yaml', 'rules.yaml', 'benchmarks.yaml', 'offers.yaml'];

/**
 * Whole-branch review, finding M1 (T13-c). `lib/methodology/schema.ts`'s
 * dossier.reading.stage/enabler used to be `z.record(z.string().min(1))`, which validates
 * successfully with any SUBSET of the four bands present — a record has no fixed key set.
 * `methodology.copy.dossier.reading[kind][band]!` (lib/report/view.ts) would then read
 * `undefined` for the missing band and crash later on `.length`, far downstream of load,
 * where it is hard to trace back to a typo in copy.yaml. Task 14 is the owner hand-pasting
 * eight band strings into that file; this turns her typo into a load-time failure instead
 * of a production 500.
 *
 * Builds a temp methodology dir identical to the real one — the other four files copied
 * verbatim, so they independently pass their OWN schemas exactly as they do in production —
 * except copy.yaml has one dossier reading band deleted. Mirrors
 * tests/methodology/load.test.ts's existing "malformed file" pattern (temp dir + one bad
 * file), applied to copy.yaml instead of questions.yaml.
 */
function dirWithMissingBand(kind: 'stage' | 'enabler', band: 'severe' | 'broken' | 'watch' | 'holding'): string {
  const dir = mkdtempSync(join(tmpdir(), 'xpg-missing-band-'));
  for (const file of OTHER_FILES) {
    copyFileSync(join(REAL_DIR, file), join(dir, file));
  }
  const copy = parseYaml(readFileSync(join(REAL_DIR, 'copy.yaml'), 'utf8')) as {
    dossier: {
      reading: Record<'stage' | 'enabler', Record<'severe' | 'broken' | 'watch' | 'holding', string>>;
    };
  };
  delete copy.dossier.reading[kind][band];
  writeFileSync(join(dir, 'copy.yaml'), dumpYaml(copy));
  return dir;
}

describe('methodology copy.yaml dossier reading bands (M1)', () => {
  it('loads today with all four bands present on both stage and enabler', () => {
    const m = loadMethodology();
    for (const kind of ['stage', 'enabler'] as const) {
      for (const band of ['severe', 'broken', 'watch', 'holding'] as const) {
        expect(m.copy.dossier.reading[kind][band]).toBeTruthy();
      }
    }
  });

  it('fails to load, rather than silently validating as undefined, when a stage band is missing', () => {
    const dir = dirWithMissingBand('stage', 'holding');
    expect(() => loadMethodology(dir)).toThrow(/copy\.yaml/);
  });

  it('fails to load when an enabler band is missing', () => {
    const dir = dirWithMissingBand('enabler', 'severe');
    expect(() => loadMethodology(dir)).toThrow(/copy\.yaml/);
  });
});
