import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  QuestionsSchema,
  RulesSchema,
  BenchmarksSchema,
  OffersSchema,
  CopySchema,
  type Methodology,
} from './schema';

const DEFAULT_DIR = fileURLToPath(new URL('../../methodology', import.meta.url));

export function loadMethodology(dir: string = DEFAULT_DIR): Methodology {
  const read = (file: string): unknown => {
    const full = path.join(dir, file);
    let raw: string;
    try {
      raw = readFileSync(full, 'utf8');
    } catch (e) {
      throw new Error(`loadMethodology: cannot read ${file} at ${full}: ${(e as Error).message}`);
    }
    return yaml.load(raw);
  };

  const parse = <T>(schema: { parse: (u: unknown) => T }, file: string): T => {
    try {
      return schema.parse(read(file));
    } catch (e) {
      throw new Error(`loadMethodology: ${file} failed validation: ${(e as Error).message}`);
    }
  };

  return {
    questions: parse(QuestionsSchema, 'questions.yaml'),
    rules: parse(RulesSchema, 'rules.yaml'),
    benchmarks: parse(BenchmarksSchema, 'benchmarks.yaml'),
    offers: parse(OffersSchema, 'offers.yaml'),
    copy: parse(CopySchema, 'copy.yaml'),
  };
}
