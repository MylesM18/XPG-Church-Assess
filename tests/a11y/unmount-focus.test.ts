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

// HOLE I2 fix: a string literal counts as markup to a naive scan. A quoted attribute value can
// carry a decoy like `data-a11y-note="<h2 id={...} tabIndex={-1}>"` -- every check below sees
// `<h2`, `id={` and `tabIndex={-1}` as real matches even though they sit inside quotes, not at a
// real tag position. Blank out string-literal CONTENTS (keeping the quotes, so positions and
// overall length stay stable) so only real JSX markup remains for the counts and slices below to
// scan. Applied AFTER stripComments -- order is load-bearing: stripping comments first is also
// what keeps a `//` inside a string literal from being mistaken for the start of a line comment.
function stripStringLiterals(source: string): string {
  return source
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

function read(rel: string): string {
  return stripStringLiterals(stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')))
}

const countOf = (source: string, re: RegExp) => (source.match(new RegExp(re, 'g')) ?? []).length

// SHADOWING, round 11. Round 10 pinned declaration counts with `\b(?:const|let|var)\s+NAME\b`,
// which only ever matches the PLAIN form. `const { pending } = { pending: false }` binds the same
// name just as completely and that regex never sees it, so the count read exactly as it does on
// correct code while the effect evaluated against the shadow. Count every binding FORM: plain,
// object-destructured and array-destructured. `NAME(?!\s*:)` in the object form is deliberate --
// `const { pending: other }` binds `other`, not `pending`, so it is not a shadow and must not
// count. If this pattern ever over-matches it fails LOUD, which is the safe direction: an honest
// red, never a silent green.
const declarationsOf = (source: string, name: string) =>
  countOf(
    source,
    new RegExp(
      `\\b(?:const|let|var)\\s+(?:${name}\\b(?!\\s*:)` +
        `|\\{[^}]*\\b${name}\\b(?!\\s*:)[^}]*\\}` +
        `|\\[[^\\]]*\\b${name}\\b[^\\]]*\\])`,
    ),
  )

// PARAMETER SHADOWING, round 12. declarationsOf above enumerates the three DECLARATION KEYWORDS, so
// a binding that uses none of them is structurally invisible to every count, ratio, bound and slice
// in this file. Wrapping an effect's EXISTING body, unchanged, in `;[false].forEach((pending) => {
// ...same body... })` rebinds `pending` to a literal for the whole body: the arm never runs, focus
// recovery is dead on every unmount at both row-button sites, and census, lint AND typecheck were all
// measured green on it. `;[null].forEach((error) => { ... })` does the same to share-control's disarm,
// which is D-3 reintroduced. A parameter is not the only such form -- `catch (e)`, `import`, class
// fields and `for (const x of ...)` heads all bind a name too.
//
// So this fix deliberately does NOT enumerate binding positions. Three rounds running, the next hole
// has sat just outside whatever the previous fix enumerated: round 10 enumerated IDENTIFIERS, round
// 11 widened to declaration SHAPES, round 12 walked round both with a construct carrying no
// declaration keyword at all. A regex over parameter lists would be a fourth enumeration, and
// parameter lists are syntactically unbounded anyway -- defaults, type annotations, rest params,
// destructuring nested inside the parameter itself.
//
// Count the identifier's TOTAL textual footprint instead. Binding a name requires WRITING it, so
// every binding form -- present or future, parameter or otherwise -- costs at least one extra
// occurrence and shows up here without this file needing to know what form it took. The bound is an
// exact equality, so it fails LOUD in both directions: an added binding reads high, a deleted use
// reads low. Its residual is a mutation that ADDS a binding and DELETES an existing use of the same
// name in one edit; for the row-button arm effect that means truncating `}, [pending, state.error])`,
// which is documented-uncovered class 2 above and open by decision.
const occurrencesOf = (source: string, name: string) => countOf(source, new RegExp(`\\b${name}\\b`))

// file -> how many <h2> elements it renders. The count is asserted first, so that adding a branch
// forces whoever adds it to come here and think about D-1 rather than silently re-breaking it.
const LISTS: Record<string, number> = {
  'app/app/[churchId]/access/members-list.tsx': 1,
  'app/app/[churchId]/access/pending-invites-list.tsx': 2,
}

// file -> the name of the row-button component this list mounts once per row, used ONLY to anchor
// the Hole-2 call-site check below to the real JSX invocation rather than a whole-file substring. A
// parallel explicit map, not a field folded into LISTS, so every existing use of LISTS (the <h2>-count
// assertions and the per-<section> branch slices above) keeps working completely unchanged. Hand
// written on purpose: deriving the name by regexing the file's own `import` line would let an
// attacker-controlled string spoof the component name, exactly the class of hole this map closes.
const ROW_BUTTON_FOR: Record<string, string> = {
  'app/app/[churchId]/access/members-list.tsx': 'RemoveMemberButton',
  'app/app/[churchId]/access/pending-invites-list.tsx': 'RevokeInviteButton',
}

const ROW_BUTTONS = [
  'app/app/[churchId]/access/remove-member-button.tsx',
  'app/app/[churchId]/access/revoke-invite-button.tsx',
]

const SHARE_CONTROL = 'app/app/[churchId]/diagnosis/share-control.tsx'

describe('unmount focus', () => {
  it('renders the number of list headings this test was written against', () => {
    for (const [file, expected] of Object.entries(LISTS)) {
      const source = read(file)
      const found = countOf(source, /<h2\b/)
      expect(
        found,
        `${file} renders ${found} <h2> elements, this test expects ${expected}. If a branch was ` +
          'added, its heading needs the SAME id and tabIndex={-1} as the others, or focus recovery ' +
          'silently no-ops whenever that branch is the one that mounts. Update this number only ' +
          'after checking that.',
      ).toBe(expected)

      // COUNTING PER BRANCH, not just per file. The check above scans the WHOLE file text and has no
      // notion of which render branch a <h2> sits in. pending-invites-list.tsx has TWO render
      // branches -- the invites.length === 0 early return and the populated return -- each rendering
      // its own <section> containing its own <h2>. A mutation that demotes the empty-state <h2> to a
      // <p> (dropping id and tabIndex) while adding a second, redundant
      // <h2 id={PENDING_HEADING_ID} tabIndex={-1}> inside the POPULATED branch keeps the file-wide
      // <h2> total at 2 and keeps every remaining <h2> carrying both attributes, so the check above
      // stays green. This reproduces D-1 exactly (see spec 6.1): when invites.length === 0 renders,
      // no element in the DOM carries access-pending-invites-heading, document.getElementById returns
      // null, the optional chain swallows it, and focus stays on <body> -- on revoking the LAST
      // pending invite, the single most common revoke there is. Slice the file at each <section>
      // boundary and require exactly one qualifying <h2> INSIDE each branch, not just present
      // somewhere in the file.
      const sectionIndices: number[] = []
      let sectionIdx = source.indexOf('<section')
      while (sectionIdx !== -1) {
        sectionIndices.push(sectionIdx)
        sectionIdx = source.indexOf('<section', sectionIdx + 1)
      }
      expect(
        sectionIndices.length,
        `${file} has ${sectionIndices.length} <section> element(s), this test expects ${expected} -- ` +
          'one per render branch, the same number as the <h2> count above, because every render ' +
          'branch is one <section> carrying exactly one heading. If a branch was added or removed, ' +
          'come back and think about D-1 rather than just bumping this number.',
      ).toBe(expected)

      sectionIndices.forEach((start, i) => {
        const end = i + 1 < sectionIndices.length ? sectionIndices[i + 1]! : source.length
        expect(
          end > start,
          `${file}: branch slice #${i + 1} has bounds [${start}, ${end}) that do not run forward. A ` +
            'slice that silently runs backwards or comes back empty would make the per-branch check ' +
            'below meaningless.',
        ).toBe(true)
        const branchTags = source.slice(start, end).match(/<h2\b[^>]*>/g) ?? []
        const qualifying = branchTags.filter(
          (tag) => tag.includes('id={') && tag.includes('tabIndex={-1}'),
        ).length
        expect(
          qualifying,
          `${file}: render branch #${i + 1} (its <section> starts at index ${start}) contains ` +
            `${qualifying} <h2> element(s) carrying BOTH id={...} and tabIndex={-1}, this test ` +
            'expects exactly 1 (D-1). A branch whose heading lost either attribute -- or never had ' +
            'one -- leaves document.getElementById unable to resolve a target when THAT branch is ' +
            'the one that mounts, and focus silently stays on <body>.',
        ).toBe(1)
      })
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

      // HOLE 2 fix: the toContain check above is a bare whole-file PRESENCE check -- it never verifies
      // that the string it found is attached to the actual row-button JSX call site. A decoy
      // substring anywhere else in the file (e.g. tucked into an unrelated attribute) satisfies it
      // while the real call site passes a completely different, or no, headingId. Anchor to the real
      // invocation of this list's row-button component and compare the id captured AT THAT CALL SITE
      // against ids[0], the id already captured from this list's own <h2> above.
      const rowButton = ROW_BUTTON_FOR[file]
      expect(
        rowButton,
        `${file} has no entry in ROW_BUTTON_FOR -- add one naming the row-button component this list ` +
          'mounts once per row, or the call-site check below has nothing to anchor to.',
      ).toBeTruthy()

      // Today both real call sites pass headingId as {IDENT}, matching the row button's own
      // `headingId: string` prop pinned in test 4. If a future edit legitimately switched to a string
      // literal, this regex would not match it and the count check below would fail over-strictly --
      // an honest failure, not a silent pass, and acceptable for that reason.
      const callSiteRe = new RegExp(`<${rowButton}\\b[^>]*\\bheadingId=\\{(\\w+)\\}`, 'g')
      const callSites = [...source.matchAll(callSiteRe)]
      expect(
        callSites.length,
        `${file} has ${callSites.length} <${rowButton} ...> call site(s) passing headingId={${ids[0]}} ` +
          '(the {IDENT} form) at the JSX invocation itself, this test expects exactly 1. Zero means the ' +
          `real call site either dropped headingId or no longer passes the identifier ${ids[0]} that ` +
          "this list's own <h2> declares -- e.g. a different identifier, a string literal, or a decoy " +
          'match elsewhere in the file inflating the whole-file check above -- so ' +
          'document.getElementById cannot resolve the heading for any row in this list. More than 1 ' +
          'means a decoy invocation is padding the count.',
      ).toBe(1)
      const callSiteId = callSites[0]![1]
      expect(
        callSiteId,
        `${file}: the <${rowButton}> call site passes headingId={${callSiteId}}, this test expects ` +
          `headingId={${ids[0]}} to match this list's own <h2> id. A mismatch means ` +
          'document.getElementById(headingId) resolves to no element (or the wrong one) on every row ' +
          'of this list, so focus recovery silently no-ops on every removal or revoke.',
      ).toBe(ids[0])
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
      const ref = refMatch![1]!

      // SHADOWING. Every assertion below matches on the NAMES `pending` and `headingId`, and a name
      // says nothing about which binding it resolves to. Declaring either one afresh INSIDE the
      // effect body -- `const pending = false` as the first line of the arm effect, or
      // `const headingId = 'decoy'` as the first line of the unmount cleanup -- leaves every pinned
      // line byte-identical, so every count, ratio, bound and slice below reads exactly as it does on
      // correct code, while the effect evaluates against the shadow and the mechanism is dead. Neither
      // typecheck nor lint objects: shadowing is legal TypeScript, and react-hooks/immutability fires
      // only on reassigning an existing binding, never on a new declaration. Both identifiers reach
      // this component WITHOUT a declaration of their own -- `pending` via array destructuring from
      // useActionState, `headingId` via the props parameter -- so any `const`/`let`/`var` binding of
      // either name in this file is a shadow, and zero is the honest count.
      // Round 11 widened this in two directions at once, because round 10's version was too narrow
      // in two independent ways. (1) It counted only the PLAIN declaration form, so the
      // object-destructured shadow `const { pending } = { pending: false }` walked straight past it.
      // (2) It tracked `pending` and `headingId` but NOT the flag ref itself -- the one identifier
      // every other assertion in this block interpolates. `const submitted = { current: false }` as
      // the first line of the arm effect leaves every pinned line byte-identical while the REAL ref
      // never arms, so the cleanup guard reads false forever and focus recovery no-ops on every
      // unmount. Both were measured green against census, lint AND typecheck before this fix.
      // The honest count differs per identifier: `pending` is bound exactly once, by the
      // useActionState array destructure; `headingId` arrives through the props PARAMETER, which
      // carries no const/let/var and so is never counted at all; the ref is declared exactly once.
      // Round 12 added the third number: the identifier's TOTAL occurrence count, which catches every
      // binding form including the ones that carry no declaration keyword at all. See occurrencesOf.
      for (const [shadowed, expected, footprint] of [
        ['pending', 1, 6],
        ['headingId', 0, 4],
        [ref, 1, 4],
      ] as const) {
        expect(
          declarationsOf(source, shadowed),
          `${file} binds \`${shadowed}\` ${declarationsOf(source, shadowed)} time(s); this test ` +
            `expects exactly ${expected}. \`pending\` is destructured once from useActionState, ` +
            '`headingId` arrives as a prop with no declaration of its own, and the ref is declared ' +
            'once. Any additional binding of one of these names -- in ANY form, including ' +
            '`const { name } = ...` -- can only shadow the real value. Placed inside either effect ' +
            'that silently kills focus recovery while leaving every other assertion in this test ' +
            'green, because they all match on the NAME and a name does not pin which binding it ' +
            'resolves to.',
        ).toBe(expected)

        expect(
          occurrencesOf(source, shadowed),
          `${file} writes the identifier \`${shadowed}\` ${occurrencesOf(source, shadowed)} time(s) ` +
            `in all; this test expects exactly ${footprint}. This is a FOOTPRINT census, not a ` +
            'declaration census: the check above enumerates const/let/var, and a binding that uses ' +
            'none of those -- a function or arrow-callback PARAMETER, a `catch (e)`, a class field, ' +
            'a `for (const x of ...)` head -- is invisible to it while shadowing the real value just ' +
            'as completely. Wrapping an effect body unchanged in ' +
            `\`;[false].forEach((${shadowed}) => { ...body... })\` was measured green against census, ` +
            'lint AND typecheck, and it kills focus recovery outright. Because binding a name means ' +
            'writing it, any such binding costs one occurrence and shows up here. If you legitimately ' +
            'added or removed a USE of this identifier, update this number -- but only after checking ' +
            'that what you added is not a new binding of the name.',
        ).toBe(footprint)
      }

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

      // CO-LOCATION, not two independent facts. The guard-and-call match and the whole-file upper
      // bound above are each satisfiable on their own by production code that MERGES the
      // unmount-cleanup effect into the arm effect: the fused guarded string
      // `if (${ref}.current) document.getElementById(headingId)?.focus()` is still present, and still
      // exactly once in the whole file, but it no longer runs inside its own
      // `useEffect(() => () => { ... }, [headingId])` -- an unmount cleanup -- it runs inside the SAME
      // effect that arms the flag, on every render where pending or state.error change. On click,
      // pending flips false -> true, that render arms the flag and immediately steals focus from the
      // button the user just pressed, and because no effect returns a cleanup any more, the real
      // unmount runs nothing and focus falls to <body> -- the exact pre-I-4 defect. Slice from the
      // cleanup effect's double-arrow open to its own closing `}, [headingId])` and require the
      // guarded call to occur inside that slice.
      const cleanupStart = source.indexOf('useEffect(() => () => {')
      const cleanupEnd = source.indexOf('}, [headingId])', cleanupStart)
      expect(
        cleanupStart >= 0 && cleanupEnd > cleanupStart,
        `${file}: could not locate the unmount-cleanup effect (cleanupStart=${cleanupStart} for ` +
          `anchor 'useEffect(() => () => {', cleanupEnd=${cleanupEnd} for anchor '}, [headingId])' ` +
          'searched from cleanupStart). Both anchors must be found and the closing one must come ' +
          'after the opening one, or slicing would silently run backwards or come back empty and make ' +
          'the co-location check below meaningless.',
      ).toBe(true)
      const cleanupBody = source.slice(cleanupStart, cleanupEnd)
      const guardedFocusInCleanup = countOf(
        cleanupBody,
        new RegExp(`if \\(${ref}\\.current\\) document\\.getElementById\\(headingId\\)\\?\\.focus\\(\\)`),
      )
      expect(
        guardedFocusInCleanup,
        `${file}: the unmount-cleanup effect body (from 'useEffect(() => () => {' to its closing ` +
          `'}, [headingId])') contains the guarded call if (${ref}.current) ` +
          `document.getElementById(headingId)?.focus() ${guardedFocusInCleanup} time(s), this test ` +
          'expects exactly 1. If the two effects were merged -- moving this call into the arm effect ' +
          'instead of leaving it inside its own unmount cleanup -- the guarded call is still present ' +
          'exactly once in the whole file (see the check above), but it now fires on every render ' +
          'while this action is pending, stealing focus from the button the user just pressed, and ' +
          'the real unmount runs no cleanup at all -- the pre-I-4 defect.',
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

    // HOLE 1 fix: the whole-file count above is necessary but not sufficient -- it never verifies
    // WHICH button carries the ref. A ref removed from one button and padded back to the same total
    // with a same-length decoy elsewhere in the file (e.g. a data attribute on an unrelated element)
    // reads as "2 of 2" without either real button being individually bound. Slice each button's own
    // opening tag and require ref={successorRef} to appear inside it.
    const buttonIndices: number[] = []
    let buttonIdx = source.indexOf('<button')
    while (buttonIdx !== -1) {
      buttonIndices.push(buttonIdx)
      buttonIdx = source.indexOf('<button', buttonIdx + 1)
    }
    expect(
      buttonIndices.length,
      `share-control.tsx: indexOf found ${buttonIndices.length} <button occurrence(s), this test ` +
        'expects 2, matching the buttons count above. A missing anchor here would make the per-button ' +
        'ref check below vacuous rather than a real check.',
    ).toBe(2)

    buttonIndices.forEach((start, i) => {
      // TRAP: the opening tag contains `onClick={(e) => { if (...) e.preventDefault() }}`, and `=>`
      // itself contains a `>`. A naive "slice to the next >" stops at the arrow, well short of the
      // real tag close, and would silently under-slice every check below. Terminate the opening tag
      // at the first `>` that is NOT immediately preceded by `=`, skipping past any `=>` first.
      let searchFrom = start
      let tagEnd = -1
      while (searchFrom < source.length) {
        const gt = source.indexOf('>', searchFrom)
        if (gt === -1) break
        if (source[gt - 1] !== '=') {
          tagEnd = gt + 1
          break
        }
        searchFrom = gt + 1
      }
      expect(
        tagEnd > start,
        `share-control.tsx: button #${i + 1}'s opening tag (starts at index ${start}) has no closing ` +
          `'>' that survives the '=>' trap (tagEnd=${tagEnd}). A missing or backwards bound would make ` +
          'the per-button ref check below meaningless rather than a real check.',
      ).toBe(true)
      const tag = source.slice(start, tagEnd)
      const tagRefs = countOf(tag, /ref=\{successorRef\}/)
      expect(
        tagRefs,
        `share-control.tsx: button #${i + 1}'s own opening tag (index ${start}) carries ` +
          `ref={successorRef} ${tagRefs} time(s), this test expects exactly 1. The whole-file count ` +
          'above can stay satisfied by a decoy elsewhere in the file even when THIS button lost its ' +
          'ref -- on the branch swap that mounts this button, successorRef.current is then null, ' +
          'successorRef.current?.focus() silently no-ops through the optional chain, and focus falls ' +
          'to <body>.',
      ).toBe(1)
    })

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
    const ref = refMatch![1]!

    // SHADOWING -- the same class the row-button loop above pins, with one difference: here `busy`
    // and `error` are LOCAL derived values, each legitimately declared exactly once at component
    // scope (`const busy = minting || revoking`, `const error = minted.error ?? revoked.error`). So
    // the honest count is 1, not 0, and pinning it to exactly 1 forbids the SECOND declaration --
    // `const busy = false` as the first line of the arm effect leaves `if (busy) acted.current = true`
    // byte-identical, so every assertion below still passes while the arm never fires and the
    // successor never receives focus, in both the mint and the revoke direction. Legal TypeScript,
    // and no lint rule fires on a new declaration.
    // Round 11 widened this the same two ways as the row-button block: count EVERY binding form
    // (`const { busy, error } = { busy: false, error: null }` slipped past round 10's plain-form-only
    // regex), and track the two REFS as well -- `acted`, which every assertion here interpolates, and
    // `successorRef`, which is the focus target itself. `const acted = { current: false }` inside the
    // arm effect, or `const successorRef = { current: null }` inside the consume effect, leaves every
    // pinned line byte-identical while the hand-off is dead. Each of these four is legitimately
    // declared exactly once at component scope, so exactly 1 is the honest count and a second binding
    // of any of them, in any form, can only be a shadow.
    // Round 12 added the second number: the identifier's TOTAL occurrence count, which catches every
    // binding form including the ones that carry no declaration keyword at all. See occurrencesOf.
    for (const [shadowed, footprint] of [
      ['busy', 3],
      ['error', 7],
      [ref, 5],
      ['successorRef', 4],
    ] as const) {
      expect(
        declarationsOf(source, shadowed),
        `share-control.tsx must bind \`${shadowed}\` exactly once, at component scope; it binds it ` +
          `${declarationsOf(source, shadowed)} time(s). A second declaration of \`${shadowed}\` -- in ` +
          'ANY form, including `const { name } = ...` -- shadows the real value; placed inside the ' +
          'arm or consume effect it silently kills the successor focus hand-off while leaving every ' +
          'other assertion in this test green, because they all match on the NAME and a name does ' +
          'not pin which binding it resolves to.',
      ).toBe(1)

      expect(
        occurrencesOf(source, shadowed),
        `share-control.tsx writes the identifier \`${shadowed}\` ` +
          `${occurrencesOf(source, shadowed)} time(s) in all; this test expects exactly ` +
          `${footprint}. This is a FOOTPRINT census, not a declaration census: the check above ` +
          'enumerates const/let/var, and a binding that uses none of those -- a function or ' +
          'arrow-callback PARAMETER, a `catch (e)`, a class field, a `for (const x of ...)` head -- ' +
          'is invisible to it while shadowing the real value just as completely. Wrapping the arm ' +
          `effect body unchanged in \`;[null].forEach((${shadowed}) => { ...body... })\` was measured ` +
          'green against census, lint AND typecheck, and on `error` it silently reintroduces D-3: the ' +
          'disarm can never run, so a later unrelated revalidation moves focus here while the user is ' +
          'elsewhere. Because binding a name means writing it, any such binding costs one occurrence ' +
          'and shows up here. If you legitimately added or removed a USE, update this number -- but ' +
          'only after checking that what you added is not a new binding of the name.',
      ).toBe(footprint)
    }

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

    // UPPER BOUND, not just a ratio. bareActedArms === guardedActedArms alone still passes when a
    // SECOND copy of the fused guarded string is ADDED alongside the real one -- e.g. a duplicate
    // dep-less effect containing `if (busy) ${ref}.current = true` -- because both counts become 2
    // and 2 === 2 reads as satisfied. Pin the guarded count to exactly 1, the same idiom this file
    // already applies to guardedArmCount and guardedFocusCount above. Be plain about what this
    // closes: the controller traced the runtime and found no demonstrated harm from that duplicate --
    // it only arms under the same `busy` condition the real effect uses, so it cannot arm at an
    // illegitimate moment, and a bare unguarded arm is still caught by the ratio check above. This
    // closes a consistency gap with the row-button side above, not a demonstrated runtime defect.
    expect(
      guardedActedArms,
      `share-control.tsx has the guarded arm if (busy) ${ref}.current = true in ${guardedActedArms} ` +
        'place(s), this test expects exactly 1. A second guarded arm anywhere -- for example a ' +
        'duplicate dep-less effect containing the same fused string -- still satisfies the ratio ' +
        'check above but adds a second arm this mechanism was not written to run.',
    ).toBe(1)

    expect(
      source,
      `share-control.tsx does not gate successorRef.current?.focus() behind ` +
        `\`if (!${ref}.current) return\` -- without that guard the consume effect fires on every ` +
        'existingLink change, including an unrelated revalidation, and steals focus to the share ' +
        'button while the user is elsewhere.',
    ).toMatch(new RegExp(`if \\(!${ref}\\.current\\) return`))

    // HOLE I1 fix: the guard-presence check above and the co-location slice below are each
    // satisfiable by production code that MERGES the arm effect and the consume effect into ONE
    // effect keyed by `[busy, error, link]`. The merged body still contains
    // `if (!${ref}.current) return` immediately before the guarded call, so the co-location slice
    // (which runs from that guard forward to the next `}, [`) still finds the call inside it -- it
    // proves guard and call share A block, never that the block is the one uniquely owned by the
    // `[link]` effect. On click, `busy` flips false -> true in the SAME effect run that arms the
    // flag, so the guard falls straight through, resets ${ref}.current to false, and focuses the
    // already-focused button as a no-op; when `link` later actually changes the flag already reads
    // false, the guard trips, and successorRef.current?.focus() never fires -- focus falls to
    // <body>, the exact V4 status-quo defect this mechanism exists to fix. Require the guard to be
    // the FIRST statement after the consume effect's own opening `useEffect(() => {`, keyed off the
    // SAME captured ref identifier so a rename of the ref cannot vacuously defeat this anchor.
    expect(
      source,
      `share-control.tsx: the consume effect does not open with \`useEffect(() => {\` immediately ` +
        `followed by its own guard \`if (!${ref}.current) return\` as its first statement -- if the ` +
        'arm effect was merged into this one (e.g. dep array `[busy, error, link]`), the guard can ' +
        'fall through on the SAME render that arms the flag, resetting it before the real link ' +
        'change is ever consumed, so successorRef.current?.focus() never fires on the branch swap ' +
        'and focus falls to <body>.',
    ).toMatch(new RegExp(`useEffect\\(\\(\\) => \\{\\s*if \\(!${ref}\\.current\\) return`))

    // CO-LOCATION, not two independent facts. The guard above (presence) and the call count below
    // (whole-file total) are each satisfiable on their own by production code that MOVES
    // successorRef.current?.focus() out of this guarded effect into a new dep-less effect: the guard
    // text is still present, and -- because the call was moved, not duplicated -- the whole-file total
    // below still reads exactly 1. But the call is no longer reachable through the guard at all; it
    // now fires on every render, stealing focus to the successor button continuously instead of only
    // on the branch swap this mechanism exists to catch. Slice the consume effect from the guard to
    // its own closing `}, [link])` and require the call to occur inside that slice.
    //
    // The slice end is the LITERAL `}, [link])`, not a generic `}, [`. This mirrors the row-button
    // cleanup slice above, whose `}, [headingId])` anchor pins that effect's dependency array as a
    // side effect of the anchor's own text. A generic `}, [` pins nothing, and truncating this
    // effect's deps to `}, [])` was measured GREEN against the whole gate chain -- census, lint and
    // typecheck alike. That mutation is a silent total kill: the consume effect then runs once on
    // mount and never again, so successorRef.current?.focus() stops firing for EVERY mint/revoke
    // swap after first paint and focus falls to <body>. react-hooks/exhaustive-deps cannot catch it
    // either, because the effect body never names `link` -- it is a re-run trigger only. With the
    // literal anchor, dropping `link` makes indexOf return -1 and the bounds assertion below fires.
    const guardIndex = source.indexOf(`if (!${ref}.current) return`)
    const consumeEffectEnd = source.indexOf('}, [link])', guardIndex)
    expect(
      guardIndex >= 0 && consumeEffectEnd > guardIndex,
      `share-control.tsx: could not locate the consume effect body (guardIndex=${guardIndex}, ` +
        `consumeEffectEnd=${consumeEffectEnd}). Both must be found and the effect's closing ` +
        '`}, [link])` must come after the guard. A -1 here means the consume effect is no longer ' +
        'keyed on `[link]` -- if its deps were truncated it runs only on mount, so the focus move ' +
        'never fires on any later branch swap. It also means slicing would silently run backwards ' +
        'from 0 and make the co-location check below meaningless.',
    ).toBe(true)
    const consumeEffectBody = source.slice(guardIndex, consumeEffectEnd)
    const callsInsideConsumeEffect = countOf(consumeEffectBody, /successorRef\.current\?\.focus\(\)/)
    expect(
      callsInsideConsumeEffect,
      `share-control.tsx's consume effect body (from \`if (!${ref}.current) return\` to its closing ` +
        `\`}, [link])\`) contains successorRef.current?.focus() ${callsInsideConsumeEffect} time(s), ` +
        'this ' +
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
