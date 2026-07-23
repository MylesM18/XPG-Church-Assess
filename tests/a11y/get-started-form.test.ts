import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'get-started', 'form.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('get-started form: info-icons + Growth dropdown', () => {
  it('uses FieldInfo for help', () => {
    expect(CODE_ONLY).toContain("from './field-info'")
    expect(CODE_ONLY).toContain('<FieldInfo')
  })
  it('renders Growth trajectory as a select with the four slug options', () => {
    expect(CODE_ONLY).toContain('name="growth_trajectory"')
    // Options are rendered via {GROWTH_OPTIONS.map(([value, label]) => <option value={value}>)},
    // so the value attribute is a JSX binding, not a literal string — the slug appears in source
    // only as the array's single-quoted tuple literal. Assert against that instead.
    for (const slug of ['declining', 'plateaued', 'growing_steadily', 'growing_rapidly']) {
      expect(CODE_ONLY, `missing Growth option ${slug}`).toContain(`'${slug}'`)
    }
  })
  it('no longer renders growth_trajectory as a text input', () => {
    expect(
      CODE_ONLY,
      'Growth must be a <select>, not a text input — value still posts as text',
    ).not.toMatch(/growth_trajectory[\s\S]{0,80}type="text"/)
  })
  it('keeps a leading empty placeholder so nothing is pre-selected', () => {
    expect(CODE_ONLY).toMatch(/<option value="">\s*Select/)
  })
  it('never uses the reserved berry token for the new help UI', () => {
    // (LiveStatus error text keeps text-berry — assert the three info fields do not add more.)
    const berryCount = (CODE_ONLY.match(/berry/g) ?? []).length
    expect(berryCount, 'only the existing LiveStatus error keeps berry').toBeLessThanOrEqual(1)
  })
})
