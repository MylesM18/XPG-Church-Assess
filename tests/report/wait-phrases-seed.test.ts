import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WAIT_PHRASE_DEFAULTS } from '@/lib/report/wait-phrases'

/**
 * The wait lines exist twice by design: seeded into `public.report_wait_phrases` (so they can be
 * reworded in the Supabase dashboard without a deploy) and shipped in lib/report/wait-phrases.ts
 * (so the feature works before that migration is applied — which on this project has historically
 * lagged the merge). Two copies drift; this pins them equal AT BIRTH.
 *
 * Deliberately NOT a live-DB test: the agent never runs `supabase db push` / `test:db`, and once
 * Natalie edits a phrase in the dashboard the table SHOULD diverge from the defaults. What must
 * never silently diverge is the migration's seed literal, which is the wording every new
 * environment starts from.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20260819000100_report_wait_phrases.sql')

const sql = fs.readFileSync(MIGRATION, 'utf8')

/** The ('...', N) tuples of the seed INSERT, in file order. */
function seededPhrases(source: string): string[] {
  const insertIdx = source.indexOf('insert into public.report_wait_phrases')
  if (insertIdx === -1) return []
  const values = source.slice(insertIdx)
  return [...values.matchAll(/\(\s*'((?:[^']|'')*)'\s*,\s*\d+\s*\)/g)].map((m) =>
    (m[1] ?? '').replace(/''/g, "'"),
  )
}

describe('report_wait_phrases migration', () => {
  const seeded = seededPhrases(sql)

  it('parses a non-empty seed (guards every assertion below from passing vacuously)', () => {
    expect(seeded.length).toBeGreaterThanOrEqual(8)
  })

  it('seeds exactly the phrases that ship in code, in the same order', () => {
    expect(seeded).toEqual([...WAIT_PHRASE_DEFAULTS])
  })

  it('gives every row a distinct, increasing sort_order so the dashboard shows them in this order', () => {
    const orders = [...sql.matchAll(/\(\s*'(?:[^']|'')*'\s*,\s*(\d+)\s*\)/g)].map((m) => Number(m[1]))
    expect(orders).toHaveLength(seeded.length)
    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b))
  })

  it('is idempotent and enables RLS with a read policy and a grant', () => {
    // A re-run (supabase db reset) must not double the list or clobber hand-edited wording.
    expect(sql).toContain('on conflict (phrase) do nothing')
    expect(sql).toContain('alter table public.report_wait_phrases enable row level security')
    expect(sql).toMatch(/create policy report_wait_phrases_select .* for select to authenticated/)
    expect(sql).toContain('grant select on public.report_wait_phrases to authenticated')
  })

  it('grants no write privilege — the app never writes these', () => {
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all)/i)
    expect(sql).not.toMatch(/for (?:insert|update|delete|all)\b/i)
  })

  it('is app-wide copy: no church, run, or respondent column', () => {
    const createIdx = sql.indexOf('create table public.report_wait_phrases')
    const table = sql.slice(createIdx, sql.indexOf(');', createIdx))
    expect(table).not.toContain('church_id')
    expect(table).not.toContain('run_id')
    expect(table).not.toContain('respondent')
  })
})

describe('the wait-phrase table is reached only through the data seam (ADR 0002)', () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it("`.from('report_wait_phrases')` appears in lib/data/wait-phrases.ts and nowhere else", () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name)) {
          if (stripComments(fs.readFileSync(full, 'utf8')).includes("from('report_wait_phrases')")) {
            hits.push(path.relative(ROOT, full))
          }
        }
      }
    }
    for (const dir of ['app', 'lib', 'components']) walk(path.join(ROOT, dir))

    expect(hits).toEqual([path.join('lib', 'data', 'wait-phrases.ts')])
  })
})
