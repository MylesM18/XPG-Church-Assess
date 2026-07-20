// Pins the focus recovery for controls that UNMOUNT when their own action succeeds (M6d I-4).
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output. jsdom,
// @testing-library and Playwright are unavailable in this repo by standing decision; source reading
// plus a controller-run browser proof is the agreed substitute.
//
// The defect, measured in a real visible focused Chrome before any of this was written:
//
//   remove-member, status quo   focusout BUTTON -> relatedTarget=null · ROW REMOVED -> settles BODY
//   remove-member, shipped      focusout -> null · ROW REMOVED · focusin -> H2
//   share-control, status quo   focusout BUTTON -> null · DETACHED    -> settles BODY
//   share-control, shipped      focusout -> null · DETACHED · focusin -> successor button
//
// COUNTING, not presence. pending-invites-list.tsx renders TWO <h2> elements -- one in the populated
// branch, one in the invites.length === 0 early return -- and revoking the LAST invite swaps between
// them. A presence check stays green when only one carries the id, and in that state
// document.getElementById returns null at exactly the moment focus needs to move, the optional chain
// swallows it, and focus stays on <body>. The I-3 census was defeated three times by variations of
// this same gap; see the header of pending-controls.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Remove block and line comments so prose describing these attributes is not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function read(rel: string): string {
  return stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
}

const countOf = (source: string, re: RegExp) => (source.match(new RegExp(re, 'g')) ?? []).length

// file -> how many <h2> elements it renders. The count is asserted first, so that adding a branch
// forces whoever adds it to come here and think about D-1 rather than silently re-breaking it.
const LISTS: Record<string, number> = {
  'app/app/[churchId]/access/members-list.tsx': 1,
  'app/app/[churchId]/access/pending-invites-list.tsx': 2,
}

const ROW_BUTTONS = [
  'app/app/[churchId]/access/remove-member-button.tsx',
  'app/app/[churchId]/access/revoke-invite-button.tsx',
]

const SHARE_CONTROL = 'app/app/[churchId]/diagnosis/share-control.tsx'

describe('unmount focus', () => {
  it('renders the number of list headings this test was written against', () => {
    for (const [file, expected] of Object.entries(LISTS)) {
      const found = countOf(read(file), /<h2\b/)
      expect(
        found,
        `${file} renders ${found} <h2> elements, this test expects ${expected}. If a branch was ` +
          'added, its heading needs the SAME id and tabIndex={-1} as the others, or focus recovery ' +
          'silently no-ops whenever that branch is the one that mounts. Update this number only ' +
          'after checking that.',
      ).toBe(expected)
    }
  })

  it('makes every list heading a focusable focus target', () => {
    const offenders: string[] = []
    for (const file of Object.keys(LISTS)) {
      const tags = read(file).match(/<h2\b[^>]*>/g) ?? []
      tags.forEach((tag, i) => {
        const missing: string[] = []
        if (!tag.includes('id={')) missing.push('id={...}')
        if (!tag.includes('tabIndex={-1}')) missing.push('tabIndex={-1}')
        if (missing.length > 0) {
          offenders.push(`${file} <h2> #${i + 1} is missing ${missing.join(' and ')}`)
        }
      })
    }
    expect(
      offenders,
      `${offenders.join('; ')}. Both attributes are load-bearing: without tabIndex={-1} an <h2> is ` +
        'not focusable and .focus() is a silent no-op, and without the id the unmounting button ' +
        'cannot resolve it. Checked per element rather than per file on purpose.',
    ).toEqual([])
  })

  it('points every heading in a list, and its button, at one identifier', () => {
    for (const file of Object.keys(LISTS)) {
      const source = read(file)
      const ids = (source.match(/<h2\b[^>]*\sid=\{(\w+)\}/g) ?? []).map(
        (tag) => /id=\{(\w+)\}/.exec(tag)![1],
      )
      expect(
        new Set(ids).size,
        `${file} uses ${new Set(ids).size} distinct heading identifiers (${ids.join(', ')}). Every ` +
          'branch must point at the SAME one, or a branch swap moves the target out from under ' +
          'document.getElementById.',
      ).toBe(1)
      expect(
        source,
        `${file} never passes ${ids[0]} to its row button, so the button cannot resolve the heading.`,
      ).toContain(`headingId={${ids[0]}}`)
    }
  })

  it('recovers focus from the unmounting row button itself', () => {
    for (const file of ROW_BUTTONS) {
      const source = read(file)
      expect(
        source,
        `${file} does not take a headingId prop. The target is resolved by id because a ref cannot ` +
          'cross the server -> client boundary; threading one would force the parent list to become ' +
          'a client component for a measured-identical result.',
      ).toMatch(/headingId:\s*string/)

      // Capture the flag identifier ONCE, the same way test 3 captures the heading identifier, and
      // require the arm, the guard and the disarm to all reference that SAME ref. Pinning the
      // guarded call and the arm separately from a shared identifier is deliberate: either half
      // alone can be satisfied by production code that guts the mechanism (arm without a reachable
      // guard, or a guard that gates a different ref than the one that gets armed).
      const refMatch = /const (\w+) = useRef\(false\)/.exec(source)
      expect(
        refMatch,
        `${file} does not declare a boolean useRef flag (e.g. \`const submitted = useRef(false)\`). ` +
          'Focus recovery needs one ref to arm while its own action is in flight and disarm on an ' +
          'error settle, so an unrelated unmount never steals or drops focus.',
      ).not.toBeNull()
      const ref = refMatch![1]

      expect(
        source,
        `${file} never arms ${ref} while its action is pending (expected \`if (pending) ${ref}.current` +
          ` = true\`), so the unmount cleanup can never tell whether this control caused the unmount, ` +
          'and focus recovery silently no-ops for every row.',
      ).toMatch(new RegExp(`if \\(pending\\) ${ref}\\.current = true`))

      expect(
        source,
        `${file} does not gate document.getElementById(headingId)?.focus() behind ` +
          `\`if (${ref}.current)\` -- the guard and the call must be read TOGETHER, not just present ` +
          'anywhere in the file, or focus fires on every unmount, including ones this control did ' +
          'not cause.',
      ).toMatch(
        new RegExp(`if \\(${ref}\\.current\\) document\\.getElementById\\(headingId\\)\\?\\.focus\\(\\)`),
      )

      expect(
        source,
        `${file} arms ${ref} but never disarms it. The action returns { error } WITHOUT ` +
          'revalidatePath, so on failure the row stays mounted with the flag set and a later ' +
          'unrelated unmount steals focus. Needs an else-if branch clearing it on an error settle.',
      ).toMatch(new RegExp(`else if \\(state\\.error\\) ${ref}\\.current = false`))
    }
  })

  it('hands focus to the successor button at share-control', () => {
    const source = read(SHARE_CONTROL)
    const buttons = countOf(source, /<button\b/)
    const refs = countOf(source, /ref=\{successorRef\}/)
    expect(
      buttons,
      `share-control.tsx renders ${buttons} buttons, this test expects 2 (one per branch).`,
    ).toBe(2)
    expect(
      refs,
      `share-control.tsx attaches successorRef to ${refs} of its ${buttons} buttons. Counting ` +
        'rather than checking presence is deliberate: with the ref on only one branch, that ' +
        'direction of the swap still drops focus to <body> and a presence check stays green.',
    ).toBe(buttons)

    // Same idiom as the row-button test above: capture the flag identifier once and hold the arm,
    // the guard and the disarm to that SAME ref, so the mechanism cannot be gutted piecemeal while
    // each assertion still finds unrelated text to match.
    const refMatch = /const (\w+) = useRef\(false\)/.exec(source)
    expect(
      refMatch,
      'share-control.tsx does not declare a boolean useRef flag (e.g. `const acted = useRef(false)`). ' +
        'Focus recovery needs one ref to arm while its own action is pending and disarm on an error ' +
        'settle, so an unrelated revalidation never steals or drops focus from the successor button.',
    ).not.toBeNull()
    const ref = refMatch![1]

    expect(
      source,
      `share-control.tsx never arms ${ref} while its action is pending (expected \`if (busy) ` +
        `${ref}.current = true\`), so the consume effect can never tell whether this component caused ` +
        'the swap, and focus recovery silently no-ops.',
    ).toMatch(new RegExp(`if \\(busy\\) ${ref}\\.current = true`))

    expect(
      source,
      `share-control.tsx does not gate successorRef.current?.focus() behind ` +
        `\`if (!${ref}.current) return\` -- without that guard the consume effect fires on every ` +
        'existingLink change, including an unrelated revalidation, and steals focus to the share ' +
        'button while the user is elsewhere.',
    ).toMatch(new RegExp(`if \\(!${ref}\\.current\\) return`))

    expect(
      source,
      `share-control.tsx arms ${ref} but never disarms it on an error settle. On that path ` +
        'existingLink does not change, the consume effect never runs, and the flag stays armed -- so ' +
        'a later unrelated revalidation moves focus to the share button while the user is elsewhere.',
    ).toMatch(new RegExp(`else if \\(error\\) ${ref}\\.current = false`))
  })
})
