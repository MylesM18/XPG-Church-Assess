import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'get-started', 'field-info.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('FieldInfo', () => {
  it('builds on the shared disclosure primitive', () => {
    expect(CODE_ONLY).toContain("from '@/components/inline-disclosure'")
    expect(CODE_ONLY).toContain('useDisclosure(')
  })
  it('names the trigger for screen readers', () => {
    expect(CODE_ONLY).toContain('aria-label={`About ${label}`}')
  })
  it('associates the label with the field via htmlFor', () => {
    expect(CODE_ONLY).toContain('htmlFor={htmlFor}')
  })
  it('spreads triggerProps and regionProps (correct ARIA wiring)', () => {
    expect(CODE_ONLY).toContain('{...triggerProps}')
    expect(CODE_ONLY).toContain('{...regionProps}')
  })
  it('never uses the reserved berry token', () => {
    expect(CODE_ONLY, 'berry is reserved for diagnosis/active-score state').not.toContain('berry')
  })
})
