// Source-reading tripwire (node env, no DOM): the invite form's Role (i) explainer now shows by
// default so a first-time admin sees the Member/Co-admin difference without a click; the (i) still
// collapses it. The plumbing is invisible in a static render: useDisclosure takes an initialOpen
// seed, FieldInfo forwards a defaultOpen prop, ONLY the invite Role field opts in, and the
// get-started form's (i)s stay collapsed. Each of those regressing silently → pinned here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const read = (...p: string[]) => stripComments(fs.readFileSync(path.join(ROOT, ...p), 'utf8'))

const disclosure = read('components', 'inline-disclosure.tsx')
const fieldInfo = read('app', 'get-started', 'field-info.tsx')
const inviteForm = read('app', 'app', '[churchId]', 'access', 'invite-member-form.tsx')
const getStartedForm = read('app', 'get-started', 'form.tsx')

describe('invite Role (i) shows by default', () => {
  it('useDisclosure accepts an initialOpen seed and uses it for initial state', () => {
    expect(disclosure, 'useDisclosure must take an optional initialOpen param').toMatch(
      /export function useDisclosure\(\s*initialOpen\s*=\s*false\s*\)/,
    )
    expect(disclosure, 'initial open state must come from initialOpen, not a hardcoded false').toMatch(
      /useState\(\s*initialOpen\s*\)/,
    )
  })

  it('FieldInfo forwards a defaultOpen prop into useDisclosure', () => {
    expect(fieldInfo, 'FieldInfo must accept a defaultOpen prop').toContain('defaultOpen')
    expect(fieldInfo, 'FieldInfo must pass defaultOpen through to useDisclosure').toMatch(
      /useDisclosure\(\s*defaultOpen\s*\)/,
    )
  })

  it('the invite Role field opts into defaultOpen', () => {
    expect(inviteForm, 'the invite Role FieldInfo must set defaultOpen').toMatch(
      /label="Role"\s+defaultOpen/,
    )
  })

  it('leaves the get-started form (i)s collapsed (no defaultOpen there)', () => {
    expect(
      getStartedForm,
      'get-started fields must stay collapsed — only the invite Role (i) opens by default',
    ).not.toContain('defaultOpen')
  })
})
