# Assessment UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent, user-requested UX improvements to the church-health assessment app — setup-form info-icons + a Growth-Trajectory dropdown, per-category dashboard invites, and a one-question-at-a-time assessment runner — without new dependencies and without touching the data model or scoring.

**Architecture:** Three self-contained slices delivered as three phases. Phase 1 builds a shared, native `useDisclosure` primitive (a button + `hidden` region, no deps) and consumes it in the setup form (Feature 1). Phase 2 adds one admin-gated `SECURITY DEFINER` read RPC and a per-card client invite panel that reuses the existing `createInvitation` server action (Feature 2). Phase 3 rewrites the shared `answer-form.tsx` into a step wizard while preserving its exact `onSubmit` contract, so both call sites and the API route need no functional change (Feature 3). Each phase produces working, reviewable software on its own.

**Tech Stack:** Next.js (App Router, RSC + client components), React `useActionState`/`useState`, TypeScript, Tailwind CSS v4 (`@theme` tokens), Supabase (Postgres + `SECURITY DEFINER` RPCs), Vitest (node env). No new dependencies.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec (`docs/superpowers/specs/2026-07-22-assessment-ux-improvements-design.md`).

- **No new dependencies.** Native HTML + Tailwind v4 + careful ARIA only. No Radix/shadcn/headless/tooltip lib.
- **No scale change.** The assessment scale stays **1–10** in code, DB (`responses.value check between 1 and 10`), validation, and scoring. We surface *bands over* 1–10; we never convert to 1–5.
- **No schema/RPC change for invite *sending*.** `invitations.category_id` and `create_invitation(p_category_id)` already exist; per-card sending reuses `createInvitation`. (One net-new *read* RPC for the invitee lookup is in scope — §6.3.)
- **No question-metadata migration.** Feature 3 reuses the existing per-question `anchors.lo/mid/hi` in `methodology/questions.yaml`.
- **Design tokens** (`app/globals.css`, Tailwind v4 `@theme`): paper `#FBF9F5` · ink `#1A1C22` · ink-soft `#565962` · line `#E4DED3` · sand `#EEE8DD` · sage `#4E6B60`. **`berry #8E2B3E` / `berry-deep #6E1F30` are RESERVED for diagnosis/active-score state** and must NOT appear in disclosures, info help, invite panels, or the wizard's active band. Fonts: display = Fraunces (`font-display`), body = Hanken (`font-body`). `--radius-card: 14px`; inputs `rounded-md`.
- **Focus ring everywhere:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`. The wizard's step heading uses a plain `:focus` outline (not `focus-visible`) so the ring is guaranteed visible after *programmatic* focus.
- **Reduced motion:** `app/globals.css` already clamps `animation-duration`/`transition-duration` to `0.01ms` under `@media (prefers-reduced-motion: reduce)`. Use **CSS transitions/animations only** (never JS-driven animation) so this global block neutralizes motion for free.
- **User-facing copy** uses the typographic apostrophe `’` (U+2019) and em dash `—`, per the m6c convention.
- **Test harness reality (binding):** `vitest.config.ts` is `{ include: ['tests/**/*.test.ts'], environment: 'node' }`. There is **no DOM, no jsdom, no `@testing-library`, and `.test.tsx` is NOT collected.** Adding any of those violates "no new dependencies." Therefore new tests are one of: (a) **pure-logic unit tests** (import a pure function, assert real behaviour); (b) **source-reading tripwire tests** (read the `.tsx` as a string, strip comments, assert on code text — the established pattern in `tests/a11y/live-status-component.test.ts`); (c) **mocked-Supabase server-action tests** (`vi.mock` + `vi.hoisted`, the pattern in `tests/ai/prose-cache-scope.test.ts`). New test files live under `tests/` and end in `.test.ts`.
- **Gates (evidence before assertion):** `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint .`), `npm run test` (`vitest run`, full suite green, count not reduced), `npm run build` (`next build`). Plus a manual VoiceOver pass on the wizard (Phase 3).
- **Git (binding):** branch `feat/assessment-ux-improvements` @ `7f80a4a`. Commit with **explicit paths only — never `git add -A`**. Do **not** push or open a PR during this phase. Never commit onto `feat/m6d-i4-unmount-focus` (PR #13). Never merge `chore/rename-cairn-to-xpg`. Never touch the census / a11y-census tests. **Never run `npm run test:db` / `supabase test db`.**

---

## §13 Decisions — locked

The spec's §13 left five last-mile choices to the plan. All are now resolved:

1. **Wizard advance-gating (§7.2) — Next-gated.** "Next" is disabled until the current step is answered; "Back" is always available except on the first step. Guarantees the single end-of-wizard submit carries a value for every question (the server validator `validateCategoryAnswers` requires exactly N answers, each an integer 1–10). *(Confirmed by Natalie.)*
2. **Invited-flow name step (§7.4) — dedicated intro step.** When `requireName`, a "Before you begin — what’s your name?" step precedes Question 1, with Next gated on a non-empty name; it is **not** counted in "Question X of N". The self flow starts at Question 1. *(Confirmed by Natalie.)*
3. **Invitee-lookup surface (§6.3) — `SECURITY DEFINER` RPC.** Forced: `invitations` has RLS enabled with **zero policies** (default-deny), so a plain client `select` is impossible. A new admin-gated `list_church_invitees(p_church_id)` RPC mirrors `get_church_members`. *(Decided in plan from code recon.)*
4. **Duplicate-send hardening (§6.2/§6.4) — UI guard only.** The panel shows "Already pending here" + a disabled control; no DB-level change to `create_invitation`. *(Confirmed by Natalie.)*
5. **Growth option storage (§5.3) — lowercase slugs.** Option `value`s are `declining | plateaued | growing_steadily | growing_rapidly` with human labels; persists as nullable text; empty placeholder → `null` via the existing `emptyToNull`. *(Decided in plan, per spec recommendation.)*

## Refinements discovered during code-reading (not in the spec — captured here)

- **Anchors threading (Feature 3).** `AnswerFormItem` is currently `{ id, text }` and **both** parent pages build items as `category.items.map((i) => ({ id: i.id, text: i.text }))`, dropping anchors. The wizard needs `anchors.lo/mid/hi`, so `AnswerFormItem` gains an `anchors` field and **both** `app/app/[churchId]/answer/[categoryId]/page.tsx` and `app/respond/[token]/page.tsx` add `anchors: i.anchors` to their `.map()`. Spec §7.5's "call sites unchanged" holds for the form *wrappers* (`self-form.tsx`, `respond-form.tsx`) but not these two parent pages. No behaviour change — the data already exists in methodology.
- **Invite UI is admin-only (Feature 2).** `list_church_invitees` is admin-gated (it returns contact PII) and raises for non-admins. The dashboard is viewed by admins *and* regular members, so the invitee fetch and per-card panels are rendered only when `role === 'admin'`. This is correct anyway (only admins can send — `create_invitation` is admin-gated) and matches the old blanket panel's effective behaviour.
- **`createInvitation` gains `revalidatePath` (Feature 2).** After a successful send, revalidate `/app/[churchId]` so the invitee list and "Already pending here" state refresh. `revalidatePath` is already imported in `actions.ts`.
- **Tailwind `hidden` vs `display` gotcha (shared primitive).** The `hidden` HTML attribute is `display:none` from the UA stylesheet, but any Tailwind `display` utility (`flex`, `grid`, `block`) **overrides it**. The disclosure *region wrapper* therefore carries **no `display` utility** (width/padding/border are fine); inner content does its own layout. This keeps `hidden` authoritative so the region is truly removed from the a11y tree and tab order when collapsed.

---

## File Structure

**Create**
- `components/inline-disclosure.tsx` — `useDisclosure()` hook (+ thin `InlineDisclosure` component). Shared by Feature 1 and Feature 2. One responsibility: the button-toggles-a-`hidden`-region behaviour with correct ARIA.
- `app/get-started/field-info.tsx` — `FieldInfo` (label + "i" trigger + inline help region). Feature 1 only.
- `lib/answers/band.ts` — `band(value)` + `BANDS` label table. Pure, Feature 3 only.
- `app/app/[churchId]/category-invite.tsx` — per-card invite panel client component. Feature 2 only. Exports `ChurchInvitee`.
- `supabase/migrations/<next-stamp>_rpc_list_church_invitees.sql` — the one net-new read RPC.
- Tests: `tests/a11y/inline-disclosure.test.ts`, `tests/a11y/field-info.test.ts`, `tests/a11y/get-started-form.test.ts`, `tests/answers/band.test.ts`, `tests/a11y/answer-form-wizard.test.ts`, `tests/access/category-invite.test.ts`, `tests/access/create-invitation-revalidate.test.ts`.

**Modify**
- `app/get-started/form.tsx` — 3 info-icons; Growth text input → `<select>`. (`app/get-started/actions.ts` is **unchanged** — it already reads `growth_trajectory` generically.)
- `app/app/[churchId]/page.tsx` — remove blanket `<InvitePanel>` (import + line 124); admin-gated invitee fetch; per-card `<CategoryInvite>`.
- `app/app/[churchId]/actions.ts` — add `revalidatePath` to `createInvitation`.
- `components/answer-form.tsx` — full rewrite into the step wizard; `AnswerFormItem` gains `anchors`.
- `app/app/[churchId]/answer/[categoryId]/page.tsx` + `app/respond/[token]/page.tsx` — thread `anchors` into the items map.

**Delete**
- `app/app/[churchId]/invite-panel.tsx` — after confirming `page.tsx` is its only reference.

---

# Phase 1 — Feature 1: setup info-icons + Growth dropdown (+ shared `useDisclosure`)

Delivers: the setup form with three inline help disclosures and a four-option Growth dropdown, plus the reusable primitive Feature 2 will consume.

### Task 1: `useDisclosure` primitive

**Files:**
- Create: `components/inline-disclosure.tsx`
- Test: `tests/a11y/inline-disclosure.test.ts`

**Interfaces:**
- Produces: `useDisclosure(): { open: boolean; toggle: () => void; triggerProps: { type: 'button'; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }; regionProps: { id: string; hidden: boolean } }`. Also `InlineDisclosure({ triggerLabel, triggerClassName?, regionClassName?, children })` for the adjacent-region case (Feature 2).

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/a11y/inline-disclosure.test.ts`:

```ts
// Source-reading test (node env, no DOM): pins the ARIA contract of the shared disclosure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'inline-disclosure.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('useDisclosure primitive', () => {
  it('wires aria-expanded to open state', () => {
    expect(CODE_ONLY).toContain("'aria-expanded': open")
  })
  it('wires aria-controls to the region id', () => {
    expect(CODE_ONLY).toContain("'aria-controls': regionId")
  })
  it('toggles the region with the hidden attribute, not CSS-only', () => {
    expect(CODE_ONLY).toContain('hidden: !open')
  })
  it('derives a stable region id from useId', () => {
    expect(CODE_ONLY).toContain('useId()')
  })
  it('does not trap or move focus (no ref.focus in the primitive)', () => {
    expect(CODE_ONLY, 'a disclosure is not a dialog — it must not move focus').not.toContain('.focus()')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/a11y/inline-disclosure.test.ts`
Expected: FAIL — `ENOENT` reading `components/inline-disclosure.tsx`.

- [ ] **Step 3: Implement the primitive**

Create `components/inline-disclosure.tsx`:

```tsx
'use client'

import { useId, useState, type ReactNode } from 'react'

/**
 * Native inline disclosure: a trigger button that expands a region IN THE DOCUMENT FLOW.
 * Not a dialog — it never traps or moves focus, has no outside-click/Esc dismissal, no portal.
 * The region uses the `hidden` attribute (not CSS-only) so it leaves the a11y tree and tab order
 * when collapsed. Consumers must NOT put a Tailwind display utility (flex/grid/block) on the region
 * wrapper — it would override `hidden`. Style width/padding/border only; let children lay out.
 */
export function useDisclosure() {
  const [open, setOpen] = useState(false)
  const regionId = useId()
  const toggle = () => setOpen((o) => !o)
  return {
    open,
    toggle,
    triggerProps: {
      type: 'button' as const,
      'aria-expanded': open,
      'aria-controls': regionId,
      onClick: toggle,
    },
    regionProps: { id: regionId, hidden: !open },
  }
}

/** Convenience wrapper for the trigger-then-region-adjacent case (Feature 2). */
export function InlineDisclosure({
  triggerLabel,
  triggerClassName,
  regionClassName,
  children,
}: {
  triggerLabel: ReactNode
  triggerClassName?: string
  regionClassName?: string
  children: ReactNode
}) {
  const { triggerProps, regionProps } = useDisclosure()
  return (
    <>
      <button {...triggerProps} className={triggerClassName}>
        {triggerLabel}
      </button>
      <div {...regionProps} className={regionClassName}>
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- tests/a11y/inline-disclosure.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/inline-disclosure.tsx tests/a11y/inline-disclosure.test.ts
git commit -m "feat(a11y): add shared native useDisclosure primitive"
```

---

### Task 2: `FieldInfo` (label + info-icon + inline help)

**Files:**
- Create: `app/get-started/field-info.tsx`
- Test: `tests/a11y/field-info.test.ts`

**Interfaces:**
- Consumes: `useDisclosure` (Task 1).
- Produces: `FieldInfo({ htmlFor: string; label: string; children: ReactNode })` — renders the field's `<label htmlFor>`, an "i" trigger with `aria-label={`About ${label}`}`, and a full-width help region (`children`) that appears in-flow above the input when open.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/a11y/field-info.test.ts`:

```ts
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
    expect(CODE_ONLY).toContain('useDisclosure()')
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/a11y/field-info.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement `FieldInfo`**

Create `app/get-started/field-info.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { useDisclosure } from '@/components/inline-disclosure'

const INFO_ICON_CLASS =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line font-body text-[11px] leading-none text-ink-soft hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * A field label with a clickable "i" that reveals help in-flow (above the input, pushing the rest
 * of the form down). The region wrapper is `w-full` with NO display utility, so it wraps to its own
 * line inside the flex-wrap row and `hidden` stays authoritative. The trigger is a real <button>,
 * kept OUT of the <label> (a label may not contain a second interactive element).
 */
export function FieldInfo({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string
  label: string
  children: ReactNode
}) {
  const { triggerProps, regionProps } = useDisclosure()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label htmlFor={htmlFor} className="font-body text-sm text-ink-soft">
        {label}
      </label>
      <button {...triggerProps} aria-label={`About ${label}`} className={INFO_ICON_CLASS}>
        i
      </button>
      <div
        {...regionProps}
        className="w-full rounded-md border border-line bg-sand p-3 font-body text-sm text-ink-soft"
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- tests/a11y/field-info.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/get-started/field-info.tsx tests/a11y/field-info.test.ts
git commit -m "feat(get-started): add FieldInfo inline help control"
```

---

### Task 3: Wire info-icons + Growth dropdown into the setup form

**Files:**
- Modify: `app/get-started/form.tsx`
- Test: `tests/a11y/get-started-form.test.ts`

**Interfaces:**
- Consumes: `FieldInfo` (Task 2).
- `app/get-started/actions.ts` is unchanged — `createChurch` already reads `growth_trajectory` from `formData` via `emptyToNull`; a `<select name="growth_trajectory">` posts the same field, and the empty placeholder → `null`.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/a11y/get-started-form.test.ts`:

```ts
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
    for (const slug of ['declining', 'plateaued', 'growing_steadily', 'growing_rapidly']) {
      expect(CODE_ONLY, `missing Growth option ${slug}`).toContain(`value="${slug}"`)
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/a11y/get-started-form.test.ts`
Expected: FAIL — no `FieldInfo`, no Growth `<select>`.

- [ ] **Step 3: Rewrite `app/get-started/form.tsx`**

Replace the whole file with:

```tsx
'use client'

import { useActionState } from 'react'
import { createChurch, type CreateChurchState } from './actions'
import { FieldInfo } from './field-info'
import { LiveStatus } from '@/components/live-status'

const initial: CreateChurchState = { error: null }

const CONTEXTS = ['urban', 'suburban', 'small_town', 'rural'] as const

// Valid cohort bands (keys mirror methodology/benchmarks.yaml). Required: the diagnosis
// engine keys its cohort percentiles by this band, so a church must have one to generate.
const ATTENDANCE_BANDS = [
  ['under_100', 'Under 100'],
  ['100_249', '100–249'],
  ['250_499', '250–499'],
  ['500_999', '500–999'],
  ['1000_1499', '1,000–1,499'],
  ['1500_plus', '1,500+'],
] as const

// Growth trajectory persists as text (nullable column). Slug values are future-proof if the
// value is ever constrained; the empty placeholder becomes null via emptyToNull in actions.ts.
const GROWTH_OPTIONS = [
  ['declining', 'Declining'],
  ['plateaued', 'Plateaued'],
  ['growing_steadily', 'Growing steadily'],
  ['growing_rapidly', 'Growing rapidly'],
] as const

// Text band fields; the third tuple element (help) opts a field into a FieldInfo icon.
const BAND_TEXT_FIELDS: readonly (readonly [string, string, string?])[] = [
  ['adults_band', 'Adults'],
  ['staff_fte_band', 'Staff (FTE)', 'FTE = full-time equivalent. One full-time role = 1.0, a half-time role = 0.5. Add them up — e.g. 2 full-time + 1 half-time staff = 2.5.'],
  ['budget_band', 'Annual budget'],
  ['church_age_band', 'Church age'],
] as const

const CONTEXT_HELP =
  'Whether your church is in an urban, suburban, small-town, or rural setting. We use this to compare you against similar churches.'

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function GetStartedForm() {
  const [state, formAction, pending] = useActionState(createChurch, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Church name (required)
        <input name="name" type="text" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Denomination
        <input name="denomination" type="text" className={inputClass} />
      </label>

      <div className="flex flex-col gap-1">
        <FieldInfo htmlFor="context" label="Context">
          {CONTEXT_HELP}
        </FieldInfo>
        <select id="context" name="context" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Weekend attendance (required)
        <select name="attendance_band" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            —
          </option>
          {ATTENDANCE_BANDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {BAND_TEXT_FIELDS.map(([name, label, help]) => (
        <div key={name} className="flex flex-col gap-1">
          {help ? (
            <FieldInfo htmlFor={name} label={label}>
              {help}
            </FieldInfo>
          ) : (
            <label htmlFor={name} className="font-body text-sm text-ink-soft">
              {label}
            </label>
          )}
          <input id={name} name={name} type="text" className={inputClass} />
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <FieldInfo htmlFor="growth_trajectory" label="Growth trajectory">
          <p>
            Think about your average weekend attendance over the last two to three years — actual
            people, not giving or membership. Pick the option that best matches the overall
            direction, setting aside seasonal dips.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            <li><span className="text-ink">Declining</span> — attendance has trended down.</li>
            <li><span className="text-ink">Plateaued</span> — attendance has held roughly flat.</li>
            <li><span className="text-ink">Growing steadily</span> — attendance has grown gradually.</li>
            <li><span className="text-ink">Growing rapidly</span> — attendance has grown quickly.</li>
          </ul>
        </FieldInfo>
        <select id="growth_trajectory" name="growth_trajectory" defaultValue="" className={inputClass}>
          <option value="">Select…</option>
          {GROWTH_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Creating…' : 'Create church'}
      </button>

      <LiveStatus message={state.error} tone="error" className="font-body text-sm text-berry" />
    </form>
  )
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npm run test -- tests/a11y/get-started-form.test.ts && npm run typecheck`
Expected: test PASS (5); typecheck clean.

- [ ] **Step 5: Visual + persistence check (dev server)**

Start the dev server (Browser pane `preview_start`, do NOT use Bash). Load `/get-started`. Confirm: Context / Staff (FTE) / Growth show an "i"; clicking each expands help in-flow and collapses again; Growth is a dropdown with the four options + "Select…"; keyboard-toggle works; no berry on the help UI. (Full end-to-end church creation is exercised by existing flows; the field name and `emptyToNull` are unchanged so persistence is behaviourally identical.)

- [ ] **Step 6: Commit**

```bash
git add app/get-started/form.tsx tests/a11y/get-started-form.test.ts
git commit -m "feat(get-started): info-icons on Context/Staff/Growth + Growth dropdown"
```

---

# Phase 2 — Feature 2: per-category invites

Delivers: the dashboard's blanket invite panel replaced by a scoped "Invite someone" disclosure on each of the eight cards, backed by one admin-gated read RPC, reusing the existing send path.

### Task 4: `list_church_invitees` RPC + `createInvitation` revalidation

**Files:**
- Create: `supabase/migrations/<next-stamp>_rpc_list_church_invitees.sql`
- Modify: `app/app/[churchId]/actions.ts` (add `revalidatePath` to `createInvitation`)
- Test: `tests/access/create-invitation-revalidate.test.ts`

**Interfaces:**
- Produces (SQL): `list_church_invitees(p_church_id uuid) returns table(invited_name text, invited_contact text, pending_category_ids text[])`, admin-gated, `SECURITY DEFINER`. One row per distinct contact (dedup key = contact, fallback name); `pending_category_ids` = category slugs where that contact has `status = 'pending'`.
- Produces (TS): `createInvitation` unchanged signature `(_prev: InviteResult, formData: FormData) => Promise<InviteResult>`, now revalidating `/app/[churchId]` on success.

- [ ] **Step 1: Determine the migration filename**

Run: `ls supabase/migrations | sort | tail -1`
Take the returned stamp and choose a strictly-greater 14-digit stamp for today, e.g. if the last is `20260721xxxxxx`, use `20260722000100`. The new file is `supabase/migrations/20260722000100_rpc_list_church_invitees.sql` (adjust the number so it sorts last).

- [ ] **Step 2: Write the migration**

Create that file with:

```sql
-- list_church_invitees: admin-only. Returns each distinct prior invitee for the church (deduped by
-- contact, falling back to name) plus the category slugs where they CURRENTLY have a pending invite.
-- SECURITY DEFINER — invitations has RLS enabled with no SELECT policy (default-deny), so this RPC
-- is the only read path, mirroring create_invitation / get_church_members.
create function public.list_church_invitees(p_church_id uuid)
returns table(invited_name text, invited_contact text, pending_category_ids text[])
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = v_uid and cm.role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  return query
  with contacts as (
    select
      coalesce(nullif(i.invited_contact, ''), i.invited_name) as dedup_key,
      max(i.invited_name)    as invited_name,
      max(i.invited_contact) as invited_contact,
      array_remove(
        array_agg(distinct case when i.status = 'pending' then i.category_id end),
        null
      ) as pending_category_ids
    from public.invitations i
    where i.church_id = p_church_id
      and coalesce(nullif(i.invited_contact, ''), i.invited_name) is not null
    group by 1
  )
  select c.invited_name, c.invited_contact, c.pending_category_ids
  from contacts c
  order by c.invited_name nulls last, c.invited_contact nulls last;
end;
$$;

revoke all on function public.list_church_invitees(uuid) from public, anon;
grant execute on function public.list_church_invitees(uuid) to authenticated;
```

- [ ] **Step 3: Write the failing revalidation test**

Create `tests/access/create-invitation-revalidate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { createInvitation } from '@/app/app/[churchId]/actions'
import { loadMethodology } from '@/lib/methodology/load'

const CHURCH = '11111111-1111-1111-1111-111111111111'
const CATEGORY = loadMethodology().questions.categories[0].id // a valid slug, e.g. 'guest'

beforeEach(() => {
  mockRevalidatePath.mockReset()
  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Grace Church' }, error: null }) }) }) }),
    rpc: async (name: string) => (name === 'create_invitation'
      ? { data: '22222222-2222-2222-2222-222222222222', error: null }
      : { data: null, error: null }),
  })
})

describe('createInvitation', () => {
  it('revalidates the dashboard after a successful send so the invitee list refreshes', async () => {
    const fd = new FormData()
    fd.set('church_id', CHURCH)
    fd.set('category_id', CATEGORY)
    fd.set('invited_name', 'Sam Taylor')
    // no invited_contact → no email attempt
    const result = await createInvitation({ link: null, emailed: false, error: null }, fd)

    expect(result.error).toBeNull()
    expect(result.link).toContain('/respond/22222222-2222-2222-2222-222222222222')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/${CHURCH}`)
  })
})
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npm run test -- tests/access/create-invitation-revalidate.test.ts`
Expected: FAIL — `revalidatePath` not called (not yet added).

- [ ] **Step 5: Add the revalidation to `createInvitation`**

In `app/app/[churchId]/actions.ts`, inside `createInvitation`, immediately before `return { link, emailed, error: null }`, add:

```ts
  revalidatePath(`/app/${churchId}`)
  return { link, emailed, error: null }
```

(`revalidatePath` is already imported at the top of the file. No other change.)

- [ ] **Step 6: Run it to verify it passes + typecheck**

Run: `npm run test -- tests/access/create-invitation-revalidate.test.ts && npm run typecheck`
Expected: test PASS; typecheck clean. (The SQL migration is not unit-testable without `test:db`, which is forbidden — it is verified by the callers' typecheck/build in Task 5 and the manual dashboard check.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_rpc_list_church_invitees.sql app/app/[churchId]/actions.ts tests/access/create-invitation-revalidate.test.ts
git commit -m "feat(invites): add list_church_invitees RPC + revalidate after send"
```

---

### Task 5: `CategoryInvite` panel + dashboard integration

**Files:**
- Create: `app/app/[churchId]/category-invite.tsx`
- Modify: `app/app/[churchId]/page.tsx`
- Delete: `app/app/[churchId]/invite-panel.tsx` (after confirming references)
- Test: `tests/access/category-invite.test.ts`

**Interfaces:**
- Consumes: `useDisclosure` (Task 1); `createInvitation` (Task 4); `list_church_invitees` (Task 4).
- Produces: `ChurchInvitee = { invited_name: string | null; invited_contact: string | null; pending_category_ids: string[] }`; `CategoryInvite({ churchId, categoryId, categoryName, invitees }: { churchId: string; categoryId: string; categoryName: string; invitees: ChurchInvitee[] })`.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/access/category-invite.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\/\/.*$/gm, '')
const PANEL = read('app/app/[churchId]/category-invite.tsx')
const PAGE = read('app/app/[churchId]/page.tsx')

describe('CategoryInvite panel', () => {
  it('fixes category_id via a hidden input (no category select)', () => {
    expect(PANEL).toContain('type="hidden"')
    expect(PANEL).toContain('name="category_id"')
    expect(PANEL, 'per-card panel must not reintroduce a category chooser').not.toContain('<select')
  })
  it('reuses the existing createInvitation server action', () => {
    expect(PANEL).toContain("from './actions'")
    expect(PANEL).toContain('createInvitation')
  })
  it('guards duplicates from the pending category ids', () => {
    expect(PANEL).toContain('pending_category_ids')
    expect(PANEL).toContain('Already pending here')
  })
  it('opens inline via the shared disclosure', () => {
    expect(PANEL).toContain("from '@/components/inline-disclosure'")
  })
  it('never uses the reserved berry token for neutral UI', () => {
    const berryCount = (PANEL.match(/berry/g) ?? []).length
    expect(berryCount, 'only a LiveStatus error may keep berry').toBeLessThanOrEqual(1)
  })
})

describe('dashboard page', () => {
  it('no longer renders the blanket InvitePanel', () => {
    expect(PAGE).not.toContain('InvitePanel')
  })
  it('renders the per-card CategoryInvite for admins from the invitee lookup', () => {
    expect(PAGE).toContain('CategoryInvite')
    expect(PAGE).toContain('list_church_invitees')
    expect(PAGE).toContain("role === 'admin'")
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/access/category-invite.test.ts`
Expected: FAIL — `category-invite.tsx` missing; `page.tsx` still imports `InvitePanel`.

- [ ] **Step 3: Implement `CategoryInvite`**

Create `app/app/[churchId]/category-invite.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { createInvitation, type InviteResult } from './actions'
import { useDisclosure } from '@/components/inline-disclosure'
import { LiveStatus } from '@/components/live-status'

export interface ChurchInvitee {
  invited_name: string | null
  invited_contact: string | null
  pending_category_ids: string[]
}

const initial: InviteResult = { link: null, emailed: false, error: null }

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

function LinkNote({ state }: { state: InviteResult }) {
  if (!state.link) return null
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md border border-line bg-paper p-3">
      <p className="font-body text-sm text-ink">
        {state.emailed ? 'Invitation emailed. Link:' : 'Invitation created — we couldn’t email it, so share this link:'}
      </p>
      <code className="break-all font-body text-xs text-ink-soft">{state.link}</code>
    </div>
  )
}

export function CategoryInvite({
  churchId,
  categoryId,
  categoryName,
  invitees,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  invitees: ChurchInvitee[]
}) {
  const { triggerProps, regionProps } = useDisclosure()
  // One shared state for the one-click re-invite rows (only one is clicked at a time) and one for
  // the new-person form. Both drive the UNCHANGED createInvitation action; revalidation refreshes
  // the list so a just-invited contact flips to "Already pending here".
  const [reState, reAction, rePending] = useActionState(createInvitation, initial)
  const [newState, newAction, newPending] = useActionState(createInvitation, initial)

  const known = invitees.filter((i) => i.invited_name || i.invited_contact)

  return (
    <div className="mt-3">
      <button
        {...triggerProps}
        className="py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Invite someone
      </button>

      <div {...regionProps} className="mt-2 rounded-md border border-line bg-paper p-3">
        <h3 className="font-body text-sm text-ink">Invite someone to answer {categoryName}</h3>

        {known.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="font-body text-xs text-ink-soft">People already invited to your church</p>
            <ul className="flex flex-col gap-1">
              {known.map((person, idx) => {
                const label = person.invited_name ?? person.invited_contact ?? 'Someone'
                const pendingHere = person.pending_category_ids.includes(categoryId)
                return (
                  <li key={`${person.invited_contact ?? person.invited_name}-${idx}`} className="flex items-center justify-between gap-2">
                    <span className="font-body text-sm text-ink">{label}</span>
                    {pendingHere ? (
                      <span className="flex items-center gap-2">
                        <span className="font-body text-xs text-ink-soft">Already pending here</span>
                        <button
                          type="button"
                          aria-disabled="true"
                          className="rounded-md border border-line px-2 py-1 font-body text-xs text-ink-soft opacity-50"
                          onClick={(e) => e.preventDefault()}
                        >
                          Invited
                        </button>
                      </span>
                    ) : (
                      <form action={reAction}>
                        <input type="hidden" name="church_id" value={churchId} />
                        <input type="hidden" name="category_id" value={categoryId} />
                        <input type="hidden" name="invited_name" value={person.invited_name ?? ''} />
                        <input type="hidden" name="invited_contact" value={person.invited_contact ?? ''} />
                        <button
                          type="submit"
                          aria-disabled={rePending}
                          onClick={(e) => { if (rePending) e.preventDefault() }}
                          className="rounded-md border border-line bg-ink px-2 py-1 font-body text-xs text-paper hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          Invite for this area
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
            <LinkNote state={reState} />
            <p className="font-body text-xs text-ink-soft">or invite someone new</p>
          </div>
        )}

        <form action={newAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="church_id" value={churchId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Their name (optional)
            <input name="invited_name" type="text" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Their email (optional — we’ll email the link)
            <input name="invited_contact" type="email" className={inputClass} />
          </label>
          <button
            type="submit"
            aria-disabled={newPending}
            onClick={(e) => { if (newPending) e.preventDefault() }}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {newPending ? 'Sending…' : 'Send invite'}
          </button>
          <p className="font-body text-xs text-ink-soft">
            If the email doesn’t send, you’ll get a copyable link to share — same as today.
          </p>
          <LiveStatus message={newState.error} tone="error" className="font-body text-sm text-berry" />
          <LinkNote state={newState} />
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the dashboard page**

In `app/app/[churchId]/page.tsx`:

Replace the import (line 8):

```tsx
import { CategoryInvite, type ChurchInvitee } from './category-invite'
```

After the `role` is computed (the `const role = membership?.role ?? null` block), add the admin-gated fetch:

```tsx
  let invitees: ChurchInvitee[] = []
  if (role === 'admin') {
    const { data: inviteeData, error: inviteeError } = await supabase.rpc('list_church_invitees', {
      p_church_id: churchId,
    })
    if (inviteeError) throw inviteeError
    invitees = (inviteeData ?? []) as ChurchInvitee[]
  }
```

Inside the `categories.map(...)` card `<article>`, immediately after the "Answer yourself" `<Link>` (before `</article>`), add:

```tsx
              {role === 'admin' && (
                <CategoryInvite
                  churchId={churchId}
                  categoryId={cat.id}
                  categoryName={cat.name}
                  invitees={invitees}
                />
              )}
```

Delete the blanket panel line (old line 124):

```tsx
      <InvitePanel churchId={churchId} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
```

- [ ] **Step 5: Delete the now-unused blanket panel (after verifying)**

Run: `grep -rn "invite-panel\|InvitePanel" app tests components lib`
Expected: only the (now-removed) reference in `page.tsx`. If nothing else references it:

```bash
git rm app/app/[churchId]/invite-panel.tsx
```

If any other reference exists, stop and reconcile before deleting.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test -- tests/access/category-invite.test.ts && npm run typecheck`
Expected: test PASS (7); typecheck clean.

- [ ] **Step 7: Visual check (dev server)**

Reload `/app/<churchId>` as an admin. Confirm: no blanket panel; each of the 8 cards has an "Invite someone" trigger that expands inline; the panel header names the area; sending a new name+email shows the soft-fail link; after a send the list updates and a pending contact shows "Already pending here" with a disabled control.

- [ ] **Step 8: Commit**

```bash
git add "app/app/[churchId]/category-invite.tsx" "app/app/[churchId]/page.tsx" tests/access/category-invite.test.ts
git rm --cached "app/app/[churchId]/invite-panel.tsx" 2>/dev/null; true
git commit -m "feat(dashboard): per-category invite panels; remove blanket InvitePanel"
```

---

# Phase 3 — Feature 3: one-question-at-a-time wizard

Delivers: `answer-form.tsx` rewritten into a step wizard (progress, Back/Next, single end submit, unset sliders, score bands, name intro step, focus-to-heading), with both call sites and the API route re-verified. Independent of Phases 1–2.

### Task 6: `band()` pure module

**Files:**
- Create: `lib/answers/band.ts`
- Test: `tests/answers/band.test.ts`

**Interfaces:**
- Produces: `type Band = 'lo' | 'mid' | 'hi'`; `band(value: number): Band` (`v<=3→'lo'`, `v<=7→'mid'`, else `'hi'`); `BANDS: { key: Band; label: string }[]` (`lo→'Low'`, `mid→'Developing'`, `hi→'Strong'`).

- [ ] **Step 1: Write the failing unit test**

Create `tests/answers/band.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { band, BANDS } from '@/lib/answers/band'

describe('band', () => {
  it('maps 1–3 to lo', () => {
    expect(band(1)).toBe('lo')
    expect(band(3)).toBe('lo')
  })
  it('maps 4–7 to mid', () => {
    expect(band(4)).toBe('mid')
    expect(band(7)).toBe('mid')
  })
  it('maps 8–10 to hi', () => {
    expect(band(8)).toBe('hi')
    expect(band(10)).toBe('hi')
  })
})

describe('BANDS', () => {
  it('labels the three bands in order', () => {
    expect(BANDS.map((b) => [b.key, b.label])).toEqual([
      ['lo', 'Low'],
      ['mid', 'Developing'],
      ['hi', 'Strong'],
    ])
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/answers/band.test.ts`
Expected: FAIL — module `@/lib/answers/band` not found.

- [ ] **Step 3: Implement `lib/answers/band.ts`**

```ts
export type Band = 'lo' | 'mid' | 'hi'

/** Three score bands over the 1–10 scale: 1–3 Low · 4–7 Developing · 8–10 Strong. */
export function band(value: number): Band {
  return value <= 3 ? 'lo' : value <= 7 ? 'mid' : 'hi'
}

export const BANDS: { key: Band; label: string }[] = [
  { key: 'lo', label: 'Low' },
  { key: 'mid', label: 'Developing' },
  { key: 'hi', label: 'Strong' },
]
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- tests/answers/band.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/answers/band.ts tests/answers/band.test.ts
git commit -m "feat(answers): add band() score-band mapping"
```

---

### Task 7: Thread `anchors` through `AnswerFormItem` and both parent pages

**Files:**
- Modify: `components/answer-form.tsx` (interface only, this task)
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx`
- Modify: `app/respond/[token]/page.tsx`

**Interfaces:**
- Produces: `AnswerFormItem = { id: string; text: string; anchors: { lo: string; mid: string; hi: string } }`. Both parent pages now pass `anchors: i.anchors` (available on the methodology `Item`).

- [ ] **Step 1: Extend the interface**

In `components/answer-form.tsx`, change the `AnswerFormItem` interface to:

```tsx
export interface AnswerFormItem {
  id: string
  text: string
  anchors: { lo: string; mid: string; hi: string }
}
```

- [ ] **Step 2: Run typecheck to see the two call sites fail**

Run: `npm run typecheck`
Expected: FAIL — `app/app/[churchId]/answer/[categoryId]/page.tsx` and `app/respond/[token]/page.tsx` each pass `items` missing `anchors`.

- [ ] **Step 3: Thread anchors in the self page**

In `app/app/[churchId]/answer/[categoryId]/page.tsx`, change the items map:

```tsx
  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors }))
```

- [ ] **Step 4: Thread anchors in the respond page**

In `app/respond/[token]/page.tsx`, change the items map identically:

```tsx
  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors }))
```

- [ ] **Step 5: Run typecheck to verify it passes**

Run: `npm run typecheck`
Expected: clean. (The wizard body still references only `id`/`text` at this point, so the build stays green; the full rewrite lands in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add components/answer-form.tsx "app/app/[churchId]/answer/[categoryId]/page.tsx" "app/respond/[token]/page.tsx"
git commit -m "feat(answers): thread question anchors into AnswerFormItem"
```

---

### Task 8: Rewrite `answer-form.tsx` into the step wizard

**Files:**
- Modify: `components/answer-form.tsx` (full body rewrite)
- Test: `tests/a11y/answer-form-wizard.test.ts`

**Interfaces:**
- Consumes: `band`, `BANDS` (Task 6); `AnswerFormItem` with `anchors` (Task 7); `AnswerInput` from `@/lib/answers/validate`; `LiveStatus`.
- Preserves exactly: `onSubmit(answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok: boolean; error?: string }>` — one call, all answers, at the end.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/a11y/answer-form-wizard.test.ts`:

```ts
// Source-reading tripwires (node env, no DOM) for the wizard's load-bearing invariants.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'answer-form.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('answer-form wizard', () => {
  it('seeds every slider UNSET (null), never pre-filling 5', () => {
    expect(CODE_ONLY).toMatch(/Record<string, number \| null>/)
    expect(CODE_ONLY).toContain('[i.id, null]')
    expect(CODE_ONLY, 'sliders must start unset').not.toMatch(/\[i\.id, 5\]/)
  })
  it('submits all answers in exactly one onSubmit call', () => {
    expect((CODE_ONLY.match(/onSubmit\(/g) ?? []).length).toBe(1)
  })
  it('shows a progressbar', () => {
    expect(CODE_ONLY).toContain('role="progressbar"')
  })
  it('gates Next on the current answer and disables Back on the first step', () => {
    expect(CODE_ONLY).toContain('currentAnswered')
    expect(CODE_ONLY).toContain('step === 0')
  })
  it('moves focus to the step heading on each step', () => {
    expect(CODE_ONLY).toContain('headingRef.current?.focus()')
    expect(CODE_ONLY).toContain('tabIndex={-1}')
  })
  it('adds the name intro step only when requireName', () => {
    expect(CODE_ONLY).toContain('hasNameStep')
    expect(CODE_ONLY).toContain('requireName')
  })
  it('renders the three bands via band()/BANDS, never berry', () => {
    expect(CODE_ONLY).toContain("from '@/lib/answers/band'")
    expect(CODE_ONLY).toContain('BANDS.map')
    expect(CODE_ONLY, 'the active band uses ink+sand, not berry').not.toContain('berry')
  })
})
```

Note: the final assertion `.not.toContain('berry')` requires the error `LiveStatus` to use a non-berry class in the wizard. Keep the error text `text-ink` (see implementation) so no `berry` appears; the error is still conveyed by `role="alert"` via `LiveStatus`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/a11y/answer-form-wizard.test.ts`
Expected: FAIL — the current component seeds `5`, has one page, no progressbar.

- [ ] **Step 3: Rewrite the body of `components/answer-form.tsx`**

Keep the top `'use client'` + `AnswerFormItem` (with `anchors`, from Task 7). Replace the component body with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { band, BANDS } from '@/lib/answers/band'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
  anchors: { lo: string; mid: string; hi: string }
}

const RANGE_LABEL: Record<'lo' | 'mid' | 'hi', string> = { lo: '1–3', mid: '4–7', hi: '8–10' }

export function AnswerForm({
  categoryName,
  items,
  requireName,
  onSubmit,
}: {
  categoryName: string
  items: AnswerFormItem[]
  requireName: boolean
  onSubmit: (answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  const [values, setValues] = useState<Record<string, number | null>>(
    () => Object.fromEntries(items.map((i) => [i.id, null])),
  )
  const [name, setName] = useState('')
  const [step, setStep] = useState(0) // 0-based over the full step list (name step included when requireName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const hasNameStep = requireName
  const questionCount = items.length
  const totalSteps = questionCount + (hasNameStep ? 1 : 0)
  const isNameStep = hasNameStep && step === 0
  const questionIndex = hasNameStep ? step - 1 : step
  const currentItem = isNameStep ? null : items[questionIndex]
  const isLastStep = step === totalSteps - 1
  const questionNumber = hasNameStep ? Math.max(1, step) : step + 1

  const currentAnswered = isNameStep
    ? name.trim() !== ''
    : currentItem != null && values[currentItem.id] != null

  // Move focus to the step heading on every step change (mirrors the done→h1 focus discipline
  // already in this component). A plain :focus outline on the heading guarantees a visible ring
  // after PROGRAMMATIC focus (focus-visible may not fire).
  useEffect(() => {
    if (!done) headingRef.current?.focus()
  }, [step, done])

  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  if (done) {
    return (
      <h1 tabIndex={-1} ref={doneRef} className="font-display text-2xl text-ink">
        Thank you — your answers have been recorded.
      </h1>
    )
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  function goNext() {
    setError(null)
    if (!currentAnswered) return
    setStep((s) => Math.min(totalSteps - 1, s + 1))
  }

  async function handleSubmit() {
    setError(null)
    const answers: AnswerInput[] = []
    for (const i of items) {
      const v = values[i.id]
      if (v == null) {
        setError('Please answer every question before submitting.')
        return
      }
      answers.push({ item_id: i.id, value: v })
    }
    if (requireName && name.trim() === '') {
      setError('Please enter your name.')
      return
    }
    setPending(true)
    try {
      const result = await onSubmit(answers, requireName ? name.trim() : null)
      if (result.ok) setDone(true)
      else setError(result.error ?? 'Something went wrong. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (isLastStep) handleSubmit()
        else goNext()
      }}
      className="flex flex-col gap-6"
    >
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

      {!isNameStep && (
        <div className="flex flex-col gap-1">
          <p className="font-body text-sm text-ink-soft">
            Question {questionNumber} of {questionCount}
          </p>
          <div
            role="progressbar"
            aria-label="Assessment progress"
            aria-valuemin={1}
            aria-valuemax={questionCount}
            aria-valuenow={questionNumber}
            className="h-1.5 w-full overflow-hidden rounded-full bg-sand"
          >
            <div
              className="h-full bg-ink transition-[width]"
              style={{ width: `${(questionNumber / questionCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isNameStep ? (
        <div className="flex flex-col gap-2">
          <h2
            tabIndex={-1}
            ref={headingRef}
            className="font-display text-lg text-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          >
            Before you begin — what’s your name?
          </h2>
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Your name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </label>
        </div>
      ) : currentItem ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Question {questionNumber} of {questionCount}</legend>
          <h2
            tabIndex={-1}
            ref={headingRef}
            className="font-display text-lg text-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ink"
          >
            {currentItem.text}
          </h2>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={values[currentItem.id] ?? 5}
              onChange={(e) => setValues((v) => ({ ...v, [currentItem.id]: Number(e.target.value) }))}
              className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              aria-label={currentItem.text}
              aria-describedby={`bands-${currentItem.id}`}
            />
            <span className="w-8 text-right font-body text-sm text-ink" aria-hidden="true">
              {values[currentItem.id] ?? '—'}
            </span>
          </div>
          {values[currentItem.id] == null && (
            <p className="font-body text-xs text-ink-soft">Drag to choose 1–10.</p>
          )}

          <ul id={`bands-${currentItem.id}`} className="flex flex-col gap-2">
            {BANDS.map((b) => {
              const v = values[currentItem.id]
              const active = v != null && band(v) === b.key
              return (
                <li
                  key={b.key}
                  className={
                    'rounded-md border-l-4 p-3 font-body text-sm ' +
                    (active ? 'border-ink bg-sand text-ink' : 'border-line bg-paper text-ink-soft')
                  }
                >
                  <span className="text-ink">
                    {b.label} <span className="text-xs">({RANGE_LABEL[b.key]})</span>
                  </span>
                  {active && <span className="sr-only"> — where you land</span>}
                  <span className="mt-1 block">{currentItem.anchors[b.key]}</span>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-disabled={step === 0}
          className="rounded-md border border-line px-4 py-2 font-body text-ink transition-opacity hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back
        </button>

        <button
          type="submit"
          aria-disabled={(isLastStep && pending) || !currentAnswered}
          onClick={(e) => { if (((isLastStep && pending) || !currentAnswered)) e.preventDefault() }}
          className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {isLastStep ? (pending ? 'Submitting…' : 'Submit') : 'Next'}
        </button>
      </div>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
    </form>
  )
}
```

- [ ] **Step 4: Run the tripwire test + typecheck**

Run: `npm run test -- tests/a11y/answer-form-wizard.test.ts && npm run typecheck`
Expected: test PASS (7); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add components/answer-form.tsx tests/a11y/answer-form-wizard.test.ts
git commit -m "feat(answers): one-question-at-a-time wizard with score bands"
```

---

### Task 9: Whole-suite gates + end-to-end re-verification of both flows

**Files:** none (verification only).

- [ ] **Step 1: Full gates**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all green; the test count is the prior total **plus** the new tests (never reduced). Do NOT run `test:db`.

- [ ] **Step 2: Re-verify the SELF flow (dev server)**

Open `/app/<churchId>/answer/<categoryId>`. Confirm: one question per screen; "Question X of N" + progress bar; sliders start unset ("—" + "Drag to choose 1–10"); Next disabled until answered; Back disabled on Q1; the active band highlights (ink border + sand fill, not berry) and all three anchors show; Submit only on the last step; on submit, all answers post once and the "Thank you" heading receives focus. Confirm the write reached `submit_self_response` (dashboard status advances for that area).

- [ ] **Step 3: Re-verify the INVITED flow (dev server)**

Create an invitation (per-card panel) and open `/respond/<token>`. Confirm the name intro step appears first ("Before you begin — what’s your name?"), gated until a name is entered and NOT counted in "Question X of N"; then the same wizard; on submit it posts to `/api/respond/[token]` and records (the token flips to `completed`). Confirm a second submit on the same token is rejected as invalid.

- [ ] **Step 4: Manual VoiceOver pass (spec §7.3)**

With VoiceOver on, step through the wizard: each step change announces the new question heading; the progress bar exposes its values; sliders announce their label + current band. Record the result in the branch notes (Tier-4 practice).

- [ ] **Step 5: Commit any notes (optional)**

If verification notes are captured in a doc, commit them with explicit paths. No code changes expected here.

---

## Gates & acceptance mapping

Run the full gate set (Task 9 Step 1) before declaring done. Each spec §10 acceptance check maps to:

- §10.1 (info-icons expand/collapse, keyboard/SR, no berry) → Tasks 1–3 + dev check (Task 3 Step 5).
- §10.2 (Growth `<select>` 4 options + placeholder; persists text or null) → Task 3 + `get-started-form` test; `createChurch`/`emptyToNull` unchanged.
- §10.3 (no blanket panel; per-card inline panel) → Task 5 + `category-invite` / `page` tripwires.
- §10.4 (deduped list; "Already pending here" + disabled; one-click re-invite; new send; soft-fail link) → Tasks 4–5 + dev check.
- §10.5 (send uses `createInvitation` with the card's `category_id`; list refreshes) → Task 4 (`revalidate` test) + Task 5.
- §10.6 (one question at a time; progress; Back/Next; Back off on Q1; Submit only last; single post) → Task 8 tripwires + Task 9 Steps 2–3.
- §10.7 (slider starts unset; Next gated; active band + all three anchors) → Task 8 + Task 6 (`band` unit test) + Task 9.
- §10.8 (focus to heading; reduced-motion; both submissions write) → Task 8 + Task 9 Steps 2–4.
- §10.9 (new unit tests pass; census untouched; typecheck/lint/build green) → Task 9 Step 1.

## Self-review (completed by plan author)

- **Spec coverage:** every §5–§9 requirement maps to a task above (see mapping). The two spec-underspecified points (anchors threading, node-only test harness) are captured in "Refinements."
- **Placeholder scan:** the only non-literal is the migration filename in Task 4 Step 1, which is *computed* from `ls supabase/migrations | sort | tail -1` (a determinate next-stamp), not a TBD. All code steps show complete code.
- **Type consistency:** `AnswerFormItem.anchors` (Task 7) matches the wizard's `currentItem.anchors[b.key]` (Task 8) and the methodology `Anchors` shape; `ChurchInvitee` (Task 5) matches the RPC's returned columns (Task 4); `band`/`BANDS` names are identical across Tasks 6 and 8.
