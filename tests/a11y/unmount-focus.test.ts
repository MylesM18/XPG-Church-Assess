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
//
// WHAT THIS FILE CAN AND CANNOT PIN. This is a source-text census: every assertion below matches
// substrings and counts occurrences in the file text. It can pin that specific lines exist, that they
// are not duplicated or removed, and (via indexOf comparisons) that some of them appear in the right
// relative order. It CANNOT pin runtime semantics that the text alone does not carry. A green run here
// means the mechanism has not been silently gutted by any mutation this file was written to catch --
// it does NOT mean the mechanism works. Four known-uncovered mutation classes, each measured real and
// each left open on purpose because closing them needs fragile multi-line contextual regexes:
//
//   1. Lifecycle re-scoping. Changing `useEffect(() => () => {` to `useEffect(() => {` turns an
//      unmount-cleanup effect into a mount/dependency-change effect. The pinned line
//      `if (submitted.current) document.getElementById(headingId)?.focus()` is byte-identical either
//      way, so no assertion here notices the effect firing at the wrong lifecycle point entirely.
//   2. Dependency arrays. Truncating the arm effect from `}, [pending, state.error])` to `}, [])`
//      means the flag never re-arms after its first render. The pinned line
//      `if (pending) submitted.current = true` is untouched, so no assertion here notices.
//   3. Derived inputs the census never inspects. Narrowing `const busy = minting || revoking` to
//      `const busy = minting` disables focus recovery on the revoke path only -- a partial regression,
//      the hardest kind to notice by reading a diff. The census only checks the literal
//      `if (busy) acted.current = true`; it has no notion of what `busy` is actually made of.
//   4. Hook identity. No assertion here distinguishes `useEffect` from `useLayoutEffect`, and the two
//      have different timing guarantees against paint.
//
// The real verification for these four classes is the controller-run browser proof and the VoiceOver
// pass, not this file. Treat a green run here as "not silently gutted," not as "verified working."
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

      // COUNTING, not presence, for the arm. A presence check stays green when an unconditional
      // `${ref}.current = true` is ADDED anywhere alongside the guarded one: the guarded line is
      // still there to match, so the .toMatch above never notices the second, unguarded arm that
      // defeats "only arm while pending". Require every occurrence of the bare assignment to be
      // accounted for by the guarded form.
      const bareArmCount = countOf(source, new RegExp(`${ref}\\.current = true`))
      const guardedArmCount = countOf(source, new RegExp(`if \\(pending\\) ${ref}\\.current = true`))
      expect(
        guardedArmCount,
        `${file} sets ${ref}.current = true in ${bareArmCount} place(s) but only ${guardedArmCount} ` +
          'of those are gated behind `if (pending)`. An unconditional arm anywhere defeats the "only ' +
          'arm while pending" guarantee even though the guarded arm line is still present.',
      ).toBe(bareArmCount)

      // UPPER BOUND, not just a ratio. bareArmCount === guardedArmCount alone still passes when a
      // SECOND copy of the fused guarded string is ADDED alongside the real one -- e.g. a duplicate
      // dep-less effect containing `if (pending) ${ref}.current = true` -- because both counts become
      // 2 and 2 === 2 reads as satisfied. Pin the guarded count to exactly 1, the same idiom this file
      // already applies to disarmResetCount and successorFocusCalls below.
      expect(
        guardedArmCount,
        `${file} has the guarded arm if (pending) ${ref}.current = true in ${guardedArmCount} ` +
          'place(s), this test expects exactly 1. A second guarded arm anywhere -- for example a ' +
          'duplicate dep-less effect containing the same fused string -- still satisfies the ratio ' +
          'check above but adds a second arm this mechanism was not written to run.',
      ).toBe(1)

      expect(
        source,
        `${file} does not gate document.getElementById(headingId)?.focus() behind ` +
          `\`if (${ref}.current)\` -- the guard and the call must be read TOGETHER, not just present ` +
          'anywhere in the file, or focus fires on every unmount, including ones this control did ' +
          'not cause.',
      ).toMatch(
        new RegExp(`if \\(${ref}\\.current\\) document\\.getElementById\\(headingId\\)\\?\\.focus\\(\\)`),
      )

      // COUNTING, not presence, for the guarded call. A presence check stays green when an
      // unconditional document.getElementById(headingId)?.focus() is ADDED alongside the guarded
      // one: the guarded call is still there to match, so the .toMatch above never notices the
      // second, unguarded call that fires focus recovery on every unmount.
      const bareFocusCount = countOf(source, /document\.getElementById\(headingId\)\?\.focus\(\)/)
      const guardedFocusCount = countOf(
        source,
        new RegExp(`if \\(${ref}\\.current\\) document\\.getElementById\\(headingId\\)\\?\\.focus\\(\\)`),
      )
      expect(
        guardedFocusCount,
        `${file} calls document.getElementById(headingId)?.focus() in ${bareFocusCount} place(s) but ` +
          `only ${guardedFocusCount} of those are gated behind \`if (${ref}.current)\`. An unconditional ` +
          'call anywhere fires focus recovery on every unmount, including ones this control did not ' +
          'cause, even though the guarded call is still present.',
      ).toBe(bareFocusCount)

      // UPPER BOUND, not just a ratio. bareFocusCount === guardedFocusCount alone still passes when a
      // SECOND copy of the fused guarded string is ADDED alongside the real one -- e.g. a new
      // dep-less effect containing `if (${ref}.current) document.getElementById(headingId)?.focus()`
      // -- because both counts become 2 and 2 === 2 reads as satisfied. At runtime that extra effect
      // fires after EVERY render while this row's own action is in flight, yanking focus off the
      // button the user is mid-interaction with. Pin the guarded count to exactly 1.
      expect(
        guardedFocusCount,
        `${file} has the guarded call if (${ref}.current) document.getElementById(headingId)?.focus() ` +
          `in ${guardedFocusCount} place(s), this test expects exactly 1. A second guarded call ` +
          'anywhere -- for example a duplicate dep-less effect containing the same fused string -- ' +
          'still satisfies the ratio check above but fires focus recovery after every render, not ' +
          'just on the unmount this mechanism exists to catch.',
      ).toBe(1)

      expect(
        source,
        `${file} arms ${ref} but never disarms it. The action returns { error } WITHOUT ` +
          'revalidatePath, so on failure the row stays mounted with the flag set and a later ' +
          'unrelated unmount steals focus. Needs an else-if branch clearing it on an error settle.',
      ).toMatch(new RegExp(`else if \\(state\\.error\\) ${ref}\\.current = false`))

      // COUNTING, not presence, for the reset. The disarm branch just checked above is the ONLY
      // legitimate place that resets ${ref} to false. A presence check stays green when an
      // unconditional `${ref}.current = false` is ADDED as the first line of the unmount cleanup
      // itself: the guard then reads false before the cleanup ever gets a chance to see it true, so
      // document.getElementById(headingId)?.focus() never fires on any unmount, even though the
      // guarded call, the guarded arm, and this disarm branch are all still present and each
      // individually match their own assertion above.
      const bareResetCount = countOf(source, new RegExp(`${ref}\\.current = false`))
      const disarmResetCount = countOf(
        source,
        new RegExp(`else if \\(state\\.error\\) ${ref}\\.current = false`),
      )
      expect(
        bareResetCount,
        `${file} resets ${ref}.current = false in ${bareResetCount} place(s) but the disarm branch ` +
          `else if (state.error) ${ref}.current = false only accounts for ${disarmResetCount} of ` +
          'them. An unaccounted-for reset anywhere -- most dangerously one prepended inside the ' +
          'unmount cleanup itself -- makes the guard read false before the cleanup ever checks it, so ' +
          'focus recovery silently no-ops on every unmount even though the guarded call is still ' +
          'present.',
      ).toBe(disarmResetCount)
      expect(
        disarmResetCount,
        `${file} has the disarm branch else if (state.error) ${ref}.current = false in ` +
          `${disarmResetCount} place(s), this test expects exactly 1.`,
      ).toBe(1)
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

    // COUNTING, not presence, for the arm. A presence check stays green when an unconditional
    // `${ref}.current = true` is ADDED anywhere alongside the guarded one -- same gap the row-button
    // arm check above closes.
    const bareActedArms = countOf(source, new RegExp(`${ref}\\.current = true`))
    const guardedActedArms = countOf(source, new RegExp(`if \\(busy\\) ${ref}\\.current = true`))
    expect(
      guardedActedArms,
      `share-control.tsx sets ${ref}.current = true in ${bareActedArms} place(s) but only ` +
        `${guardedActedArms} of those are gated behind \`if (busy)\`. An unconditional arm anywhere ` +
        'defeats the "only arm while pending" guarantee even though the guarded arm line is still ' +
        'present.',
    ).toBe(bareActedArms)

    expect(
      source,
      `share-control.tsx does not gate successorRef.current?.focus() behind ` +
        `\`if (!${ref}.current) return\` -- without that guard the consume effect fires on every ` +
        'existingLink change, including an unrelated revalidation, and steals focus to the share ' +
        'button while the user is elsewhere.',
    ).toMatch(new RegExp(`if \\(!${ref}\\.current\\) return`))

    // CO-LOCATION, not two independent facts. The guard above (presence) and the call count below
    // (whole-file total) are each satisfiable on their own by production code that MOVES
    // successorRef.current?.focus() out of this guarded effect into a new dep-less effect: the guard
    // text is still present, and -- because the call was moved, not duplicated -- the whole-file total
    // below still reads exactly 1. But the call is no longer reachable through the guard at all; it
    // now fires on every render, stealing focus to the successor button continuously instead of only
    // on the branch swap this mechanism exists to catch. Slice the consume effect from the guard to
    // its own closing `}, [` and require the call to occur inside that slice.
    const guardIndex = source.indexOf(`if (!${ref}.current) return`)
    const consumeEffectEnd = source.indexOf('}, [', guardIndex)
    expect(
      guardIndex >= 0 && consumeEffectEnd > guardIndex,
      `share-control.tsx: could not locate the consume effect body (guardIndex=${guardIndex}, ` +
        `consumeEffectEnd=${consumeEffectEnd}). Both must be found and the effect's closing \`}, [\` ` +
        'must come after the guard, or slicing would silently run backwards and make the co-location ' +
        'check below meaningless.',
    ).toBe(true)
    const consumeEffectBody = source.slice(guardIndex, consumeEffectEnd)
    const callsInsideConsumeEffect = countOf(consumeEffectBody, /successorRef\.current\?\.focus\(\)/)
    expect(
      callsInsideConsumeEffect,
      `share-control.tsx's consume effect body (from \`if (!${ref}.current) return\` to its closing ` +
        `\`}, [\`) contains successorRef.current?.focus() ${callsInsideConsumeEffect} time(s), this ` +
        'test expects exactly 1. If the call was moved into a separate dep-less effect instead of ' +
        'staying behind this guard, the guard is still present as text and the whole-file count below ' +
        'is still 1, but the call now fires on every render, not just the branch swap this mechanism ' +
        'exists to catch.',
    ).toBe(1)

    // COUNTING, not presence, for the guarded call across the WHOLE file. The co-location check above
    // pins the call to inside the guarded effect body, but a second, unconditional
    // successorRef.current?.focus() could still be ADDED elsewhere in the file -- for example
    // duplicated rather than moved -- while the co-located original stays intact and the check above
    // still reads exactly 1. Require the call to occur exactly once in the whole file too.
    const successorFocusCalls = countOf(source, /successorRef\.current\?\.focus\(\)/)
    expect(
      successorFocusCalls,
      `share-control.tsx calls successorRef.current?.focus() ${successorFocusCalls} time(s), this ` +
        'test expects exactly 1. A second, unconditional call anywhere in the file fires focus ' +
        "recovery on every existingLink change, including another admin's revalidation, regardless " +
        'of whether the guarded call is also still present.',
    ).toBe(1)

    expect(
      source,
      `share-control.tsx arms ${ref} but never disarms it on an error settle. On that path ` +
        'existingLink does not change, the consume effect never runs, and the flag stays armed -- so ' +
        'a later unrelated revalidation moves focus to the share button while the user is elsewhere.',
    ).toMatch(new RegExp(`else if \\(error\\) ${ref}\\.current = false`))

    // COUNTING, not presence, for the resets. There are exactly TWO legitimate resets of ${ref}: the
    // disarm branch just checked above, and the consume effect's own reset, which must sit AFTER the
    // consume guard `if (!${ref}.current) return`. A presence check stays green when a third reset is
    // ADDED before that guard: the guard then reads false before the effect ever gets a chance to see
    // it true, so successorRef.current?.focus() never fires, even though the guarded call, the
    // guarded arm, and the disarm branch are all still present and each individually match their own
    // assertion above.
    const totalResetCount = countOf(source, new RegExp(`${ref}\\.current = false`))
    expect(
      totalResetCount,
      `share-control.tsx resets ${ref}.current = false in ${totalResetCount} place(s), this test ` +
        'expects exactly 2: the disarm branch and the reset inside the consume effect. A third reset ' +
        'anywhere defeats the mechanism even though every line this test checks elsewhere is still ' +
        'present.',
    ).toBe(2)

    const disarmResetCount = countOf(source, new RegExp(`else if \\(error\\) ${ref}\\.current = false`))
    expect(
      disarmResetCount,
      `share-control.tsx has the disarm branch else if (error) ${ref}.current = false in ` +
        `${disarmResetCount} place(s), this test expects exactly 1.`,
    ).toBe(1)

    // guardIndex was already computed above, for the co-location check; reuse it rather than
    // re-running indexOf a second time.
    const resetsBeforeGuard = countOf(
      source.slice(0, guardIndex),
      new RegExp(`${ref}\\.current = false`),
    )
    expect(
      resetsBeforeGuard,
      `share-control.tsx resets ${ref}.current = false ${resetsBeforeGuard} time(s) before the ` +
        `consume guard if (!${ref}.current) return, this test expects exactly 1 (the disarm branch, ` +
        'which runs in the earlier arm effect). A reset placed before the guard inside the consume ' +
        'effect itself -- for example one prepended above the guard -- makes the guard permanently ' +
        'true, so the effect always early-returns and successorRef.current?.focus() never fires on ' +
        'the branch swap it is meant to catch.',
    ).toBe(1)
  })
})
