# Assessment UX Improvements — Design Spec

**Date:** 2026-07-22 · **Branch:** `feat/assessment-ux-improvements` (off `6080e86`)
**Status:** Design approved via `superpowers:brainstorming` visual-mockup loop. All three features settled = option **A**. This spec is the written design (brainstorming step 6); it precedes the implementation plan (`superpowers:writing-plans`).

This spec bundles three independent, user-requested UX improvements to the church-health assessment app. They share one hand-built interaction primitive (an inline disclosure) but otherwise touch three separate surfaces and can be implemented and reviewed in three self-contained slices.

---

## 1. Goal

Make three rough edges in the existing flow calmer and more self-explanatory, without new dependencies and without changing the data model:

1. **Church setup form** — add clickable "i" info-icons that explain **Context**, **Staff (FTE)**, and **Growth Trajectory**, and turn **Growth Trajectory** from a free-text box into a four-option dropdown.
2. **Assessment dashboard** — remove the single blanket invite panel and give each of the eight category cards its own scoped "Invite someone" affordance, so an admin invites a person to answer *one specific area*.
3. **Assessment runner** — replace the all-questions-on-one-page slider form with a one-question-at-a-time wizard (progress, Back/Next, a single submit at the end) that shows what each score band means.

Success = each surface is more legible, keyboard/screen-reader sound, and behaviourally identical downstream (same DB writes, same scale, same invite-sending path).

---

## 2. Scope

### In scope
- **Feature 1** — `app/get-started/form.tsx`: three info-icons + inline help; Growth Trajectory → `<select>` (4 options).
- **Feature 2** — `app/app/[churchId]/page.tsx`: remove blanket `<InvitePanel>` (line 124); add a per-card scoped invite disclosure; one net-new server read ("people already invited to this church").
- **Feature 3** — `components/answer-form.tsx`: one-question-per-screen wizard with score bands; behaviour preserved for both the self and invited call sites.
- **One shared primitive** — a native `InlineDisclosure` (button + collapsible region) used by Feature 1 and Feature 2.
- New focused unit/interaction tests for the new components (not the census/a11y-census suite).

### Out of scope / explicitly won't-do
- **No scale change.** The assessment scale stays **1–10** in code, DB (`responses.value check between 1 and 10`), validation, and scoring. We surface *bands over* 1–10; we do not convert to 1–5.
- **No schema/RPC change for invite *sending*.** `invitations.category_id` and `create_invitation(p_category_id)` already exist; per-card sending reuses `createInvitation` unchanged.
- **No new dependencies.** No Radix/shadcn/headless/tooltip lib (none is installed). Everything is native HTML + Tailwind v4 + careful ARIA.
- **No change to `member_invitations`** (account-level, Type B) or the `/accept/{token}` flow.
- **No migration for question metadata.** Feature 3 reuses the existing per-question `anchors.lo/mid/hi` in `methodology/questions.yaml`.
- Not touching the a11y-census / census tests, `chore/rename-cairn-to-xpg`, or `feat/m6d-i4-unmount-focus` (PR #13).

---

## 3. Locked decisions

Four framing decisions (locked in brainstorming steps 3–4) and the three per-feature settlements (option A, approved by Natalie in the mockup loop, s18–s23):

| # | Decision | Settled |
|---|----------|---------|
| D1 | Growth Trajectory becomes a **dropdown** (free-text → `<select>`), value still persists as text | s15 |
| D2 | Per-category invite = **pick-existing-people + add-new** panel per card; needs one net-new "who's been invited here" lookup | s15 |
| D3 | Scale stays **1–10**; surface **three anchor bands** reusing `anchors.lo/mid/hi` | s15 |
| D4 | Build **native HTML + Tailwind, no new deps**; hand-build disclosure/dropdown/wizard with careful ARIA | s15 |
| F1 = A | Info help opens **inline (in-flow disclosure)**, not a floating popover or focus-trap modal; Growth dropdown = **four options, no "Not sure"** | s18/s20 |
| F2 = A | Per-card invite **opens inline, under the card** (not a modal, not always-open) | s21 |
| F3 = A | Bands split **1–3 Low · 4–7 Developing · 8–10 Strong**; labels final | s23 (doubly confirmed) |

---

## 4. Shared primitive — `InlineDisclosure` (native, no deps)

Both Feature 1 (help text) and Feature 2 (invite panel) are the same interaction: a trigger button that expands a region **in the document flow**, pushing the content below it down. Build it once.

**Working name in s15 was `InfoPopover`; it is renamed `InlineDisclosure` because the settled pattern is a disclosure, not a popover** (no floating layer, no outside-click/Esc dismissal, no positioning math).

**Shape.**
- Trigger: a real `<button type="button">` with `aria-expanded={open}` and `aria-controls={regionId}`.
- Region: a `<div id={regionId} hidden={!open}>` rendered immediately after the trigger, in flow. `hidden` (not CSS-only) so it is correctly removed from the a11y tree and tab order when collapsed.
- State: local `useState(false)`; toggled on click. No global state, no portal.
- Motion: expand/collapse may animate height/opacity, but the animation MUST be disabled under `@media (prefers-reduced-motion: reduce)` (the block already exists in `app/globals.css`). Content must be fully usable with animation off.
- Focus: toggling does not trap or move focus (it is not a dialog). Focus stays on the trigger; the newly revealed region is reachable by continuing to tab.
- Styling: ink / ink-soft / line / sand tokens only. **`berry` is reserved** for diagnosis/active-score state and must not appear here.

The primitive itself is content-agnostic (it renders `children` in the region). Feature 1 wraps it as `FieldInfo` (help copy); Feature 2 renders an invite form inside it.

---

## 5. Feature 1 — setup info-icons + Growth dropdown

**File:** `app/get-started/form.tsx` (client, `useActionState`, posts to `createChurch` → `create_church_with_admin` RPC; all fields nullable text via `emptyToNull`).

**Current state (from code map, s15):** `Context` is a `<select>` (urban/suburban/small_town/rural). `Staff (FTE)` and `Growth trajectory` are two of five fields emitted by a shared `.map()` of `<input type="text">` (`adults_band, staff_fte_band, budget_band, church_age_band, growth_trajectory`). No help-text/tooltip pattern exists anywhere — this feature establishes one.

### 5.1 Info-icons on three fields
Add a `FieldInfo` control (the "i" trigger + inline help region from §4) to the labels of **Context**, **Staff (FTE)**, and **Growth Trajectory**.

- The trigger sits next to the field label, `aria-label="About {field name}"`, small, ink-soft, focus-visible ring. It is not `berry`.
- Clicking expands the help text in-flow directly under that field, pushing subsequent fields down. Clicking again collapses it.
- One `FieldInfo` component, used three times — differing only in its copy.

### 5.2 Help copy (approved drafts, s16 — adjustable at review)
User-facing strings use the house convention: typographic apostrophe `’` (U+2019) and em dash `—`.

- **Context (brief):** "Whether your church is in an urban, suburban, small-town, or rural setting. We use this to compare you against similar churches."
- **Staff (FTE) (brief):** "FTE = full-time equivalent. One full-time role = 1.0, a half-time role = 0.5. Add them up — e.g. 2 full-time + 1 half-time staff = 2.5."
- **Growth Trajectory (longer):** "Think about your average weekend attendance over the last two to three years — actual people, not giving or membership. Pick the option that best matches the overall direction, setting aside seasonal dips." Followed by the four option glosses:
  - **Declining** — attendance has trended down.
  - **Plateaued** — attendance has held roughly flat.
  - **Growing steadily** — attendance has grown gradually.
  - **Growing rapidly** — attendance has grown quickly.

### 5.3 Growth Trajectory → dropdown
- Pull `growth_trajectory` **out** of the generic `.map()`; render it explicitly (in its current visual position) as a `<select name="growth_trajectory">`.
- Options (final, no "Not sure"): **Declining · Plateaued · Growing steadily · Growing rapidly**, plus a leading empty placeholder option ("Select…") so nothing is pre-selected.
- The remaining four fields stay in the `.map()`.
- **Persistence unchanged:** value posts as text; the column is nullable text; `emptyToNull` turns the empty placeholder into `null`. No schema change. Optionally the option *values* can be lowercase slugs (`declining|plateaued|growing_steadily|growing_rapidly`) with human labels — decide in the plan; either persists fine.

---

## 6. Feature 2 — per-category invites

**File:** `app/app/[churchId]/page.tsx` (server component). Eight cards from `categories.map(...)`. **Remove the blanket `<InvitePanel>` at line 124.**

**Category display names** (for the panel header): Guest Experience · Community/Connection · Discipleship/Leadership · Volunteer · Generosity · Governance/Accountability · Communication · Org Structure/Systems.

### 6.1 Per-card affordance
Each card gains an **"Invite someone"** trigger that expands an invite panel **inline, under that card** (the §4 disclosure). Because `page.tsx` is a server component and the panel is interactive, the panel is a **new client component** — proposed `app/app/[churchId]/category-invite.tsx` — rendered once per card inside the existing `.map()`, receiving `churchId`, `categoryId`, `categoryName`, and the pre-fetched church-invitee list (§6.3).

### 6.2 Panel contents (locked, s21)
1. Header: **"Invite someone to answer {Area}"**.
2. **"People already invited to your church"** — a deduped list of known contacts:
   - A contact with **no pending invite for this area** → a one-click **"Invite for this area"** button (prefills their name/contact, sends scoped to this `category_id`).
   - A contact who **already has a pending invite for this area** → shown as **"Already pending here"** with a disabled **"Invited"** control (the duplicate guard).
3. Divider: **"or invite someone new"**.
4. **Name + Email** inputs + **Send invite** button.
5. Soft-fail note: "If the email doesn’t send, you’ll get a copyable link to share — same as today."

If the church has no prior invitees, the "already invited" list section is omitted (panel shows only the new-person form).

### 6.3 The one net-new server piece — church-invitee lookup
A read of `invitations` for the church, **deduped by contact**, returning each known invitee plus which areas they currently have pending. Fetched **once** in `page.tsx` (server) and passed to all eight cards, so per-card "Already pending here" is computed client-side with no extra round-trips.

- **Preferred:** a `SECURITY DEFINER` RPC, e.g. `list_church_invitees(p_church_id)`, admin-gated identically to the existing invite RPCs, returning rows shaped:
  `{ invited_name: text, invited_contact: text, pending_category_ids: text[] }`
  — one row per distinct contact (dedup key = `invited_contact`, fallback `invited_name`), `pending_category_ids` = the `category_id`s where that contact has `status = 'pending'`.
- Alternative: a server-side `select` under RLS if admins can already read their church's `invitations` rows. The plan picks one after checking the existing RLS policies; the RPC route is preferred for parity with `create_invitation`/`get_invitation_context`.
- The list includes contacts from invitations of any status (so a completed invitee can still be re-invited to a new area); only **pending** rows drive the per-area duplicate guard.

### 6.4 Sending — reuse `createInvitation` unchanged
Both paths call the existing `createInvitation` (`app/app/[churchId]/actions.ts` → `create_invitation` RPC, SECURITY DEFINER, admin-gated, returns the token id; builds `${APP_URL}/respond/${token}`; optional Resend email, soft-fails to a copyable link) with `category_id` **fixed to the card**:
- One-click re-invite: pass the chosen contact's name/contact + this card's `category_id`.
- New person: pass the typed name/email + this card's `category_id`.

After a successful send, the dashboard data must refresh so the invitee list and "Already pending here" state update — revalidate the dashboard path from the server action (or optimistically update the client panel and reconcile on revalidate). The plan chooses; revalidation is the safe default.

### 6.5 Reuse note
The existing `app/app/[churchId]/invite-panel.tsx` already has name + email + `createInvitation` wiring with a `category_id` select. The per-card panel is essentially that component with the category select **dropped** and `category_id` fixed — reuse its form/soft-fail markup rather than reinventing it. The blanket component/import is deleted from `page.tsx`; keep or fold `invite-panel.tsx` as the plan sees fit (no other caller).

---

## 7. Feature 3 — one-question-at-a-time wizard

**File:** `components/answer-form.tsx` (client, shared). **The wizard lives entirely inside this component.**

**Current state (s15):** all questions render in one `<form>`; each is a `<fieldset><legend>{question}</legend><input type="range" min={1} max={10} step={1} value={5}/></fieldset>`; state is a flat `useState<Record<itemId, number>>` seeded to `5`, plus a `name` string; on submit it calls the `onSubmit` prop. Two call sites share it: **self** (`app/app/[churchId]/answer/[categoryId]/self-form.tsx`, `requireName={false}`, → `submit_self_response` RPC) and **invited** (`app/respond/[token]/respond-form.tsx`, `requireName={true}`, → `POST /api/respond/[token]`).

### 7.1 Behaviour (settled)
- **One question per screen.** Progress indicator **"Question X of N"** plus a slim progress bar (`role="progressbar"`, `aria-valuenow/min/max` updated per step).
- **Back / Next** navigation; **Back disabled on the first question**; on the last question **Next becomes "Submit"**.
- **One submit at the very end** — all answers post together in a single call, exactly as today (no per-question saving). The existing contract `onSubmit(answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok; error? }>` is unchanged.
- **1–10 slider** per question (native `<input type="range" min={1} max={10} step={1}>`).
- **Three score bands** derived from the value: `band(v) = v <= 3 ? 'lo' : v <= 7 ? 'mid' : 'hi'` → **1–3 Low · 4–7 Developing · 8–10 Strong** (labels final).
  - The band matching the current value is highlighted with an **ink left-border + sand fill** ("Where you land"). **Not `berry`** (reserved for diagnosis) — this keeps the active-state colour consistent with Features 1 and 2.
  - All three anchors (`anchors.lo` → Low, `anchors.mid` → Developing, `anchors.hi` → Strong) are shown as stacked cards, so the full scale is visible, not just the current band.
- **Content source:** the per-question `anchors.lo/mid/hi` already in `methodology/questions.yaml` (Zod `lib/methodology/schema.ts`, loader `lib/methodology/load.ts`). No new data.

### 7.2 "Slider starts unset" + completeness
The slider must **start unset** and never pre-fill a `5`. This changes the answer model and forces a completeness rule:

- **Model:** the internal state (today `Record<itemId, number>` seeded to 5) becomes `Record<itemId, number | null>`, all `null` until the person moves that question's slider; at submit it is converted to `AnswerInput[]` exactly as today (gating in the next bullet guarantees no nulls remain). The range input renders in a visibly neutral/unset state (no value bubble, a "Drag to choose 1–10" hint) until first interaction, after which it shows the chosen value and active band.
- **Advance/submit rule (spec decision — flag for review):** **Next is enabled only once the current question has an answer;** Back is always available (except Q1). This guarantees the final single Submit has an answer for every question — required because each `responses` row needs a `value` 1–10. Alternative (allow free skipping, then block Submit and jump to the first unanswered) is noted but not recommended: it produces a confusing end-of-wizard error. See §13.

### 7.3 Accessibility
- **Focus moves to the new question heading on each step change.** The heading is `tabIndex={-1}` with a **visible focus outline on programmatic focus** (mirror the existing runner discipline where, on `done`, focus moves to the success `<h1 tabIndex=-1>`).
- **Reduced-motion:** the step transition animation is disabled under `prefers-reduced-motion: reduce`; navigation remains fully functional with motion off.
- Sliders keep an `aria-label`/`aria-describedby` tying them to the question and the current band; the progress bar exposes its values to AT.
- A manual VoiceOver pass on the wizard's step/focus behaviour is recommended before merge (consistent with the team's Tier-4 practice), separate from automated tests.

### 7.4 Name collection in the invited flow (spec decision — flag for review)
The invited flow needs the respondent's name (`requireName={true}`); the self flow does not. In a one-question-per-screen wizard the name field needs a home. **Proposed:** when `requireName`, insert a dedicated **intro step ("Before you begin — what’s your name?")** ahead of Question 1, whose Next is gated on a non-empty name; it is not counted in "Question X of N". The self flow (`requireName={false}`) starts directly at Question 1. Alternative (name field on the final Submit screen) is noted in §13.

### 7.5 Why the refactor is contained — and what must be re-verified
Because the wizard **preserves the existing `onSubmit(answers: AnswerInput[], respondentLabel: string | null)` all-at-once contract** and reuses the already-passed `requireName` prop, the two call sites and the API route need **no functional change**:
- `self-form.tsx` — unchanged; still passes `onSubmit`/`requireName={false}`.
- `respond-form.tsx` — unchanged; still passes `onSubmit`/`requireName={true}`.
- `app/api/respond/[token]/route.ts` — unchanged; still receives the same all-answers payload shape.

However, both flows **share the refactored component**, so both must be **re-verified end-to-end** (self submit → `submit_self_response`; invited submit → `/api/respond/[token]`) after the change. "Touches both call sites" (s15/s23) = this shared-component re-verification, not divergent edits. If the payload shape genuinely must change (it should not), that is a design change to raise before coding.

---

## 8. Design tokens & conventions (bind all three features)

- Tokens (from `app/globals.css`): paper `#FBF9F5` · ink `#1A1C22` · ink-soft `#565962` · line `#E4DED3` · sand `#EEE8DD` · sage `#4E6B60`. **`berry #8E2B3E` / `berry-deep #6E1F30` are RESERVED for diagnosis/active-score state** and must not be used for neutral UI, disclosures, or the wizard's active band.
- Fonts: display = Fraunces, body = Hanken. `--radius-card: 14px`; inputs `rounded-md`.
- Buttons (primary): `bg-ink text-paper rounded-md px-4 py-2 hover:opacity-90 aria-disabled:opacity-50`. Links: `text-ink underline underline-offset-2`.
- Focus ring everywhere: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink` (the wizard heading uses a plain `:focus` outline so the ring is guaranteed visible after programmatic focus).
- Reduced-motion block already exists in `globals.css`; every animation added here honours it.
- User-facing copy uses `’` (U+2019) and `—`, per the m6c apostrophe convention.

---

## 9. Testing position

Follow the existing vitest patterns; **do not touch the census / a11y-census suite.** Add focused new tests for the new behaviour:

- **`InlineDisclosure` / `FieldInfo`** — trigger toggles `aria-expanded`; region is `hidden` when collapsed (absent from a11y tree/tab order) and present when open.
- **Growth dropdown** — renders four options + empty placeholder; posts the selected value; empty → null via existing `emptyToNull`.
- **Wizard** — Back disabled on Q1; Next disabled until the current question is answered; last step's control is Submit; a single `onSubmit` call carries all answers; band(v) mapping at boundaries (3/4 and 7/8); focus moves to the heading on step change; name intro step present only when `requireName`.
- **Feature 2 invitee list** — "Already pending here" + disabled control when the contact has a pending invite for that card's `category_id`; one-click send calls `createInvitation` with the fixed `category_id`.

Manual: VoiceOver pass on the wizard (§7.3). Standard gates (typecheck, lint, unit tests, production build) must pass. **Never run `npm run test:db` / `supabase test db`.**

---

## 10. Acceptance checks

1. Setup form shows "i" triggers on Context, Staff (FTE), Growth Trajectory; each expands its help in-flow and collapses again; keyboard + screen-reader operable; no `berry`.
2. Growth Trajectory is a `<select>` with exactly Declining/Plateaued/Growing steadily/Growing rapidly + an empty placeholder; a submitted church persists the chosen text (or null when left blank); no schema error.
3. Dashboard no longer renders the blanket invite panel (old line 124); each of the eight cards has an inline "Invite someone" panel scoped to its area.
4. The panel lists prior church invitees deduped; a contact pending for that area shows "Already pending here" + disabled control; a non-pending contact re-invites in one click; a new name+email sends; email soft-fail shows a copyable link.
5. Sending uses the existing `createInvitation` with the card's `category_id`; after send, the list/pending state refresh.
6. Runner shows one question at a time with "Question X of N" + progress bar, Back/Next, Back disabled on Q1, Submit only on the last step, and posts all answers in one call.
7. Each question's slider starts unset; Next is disabled until it is answered; the active band (1–3/4–7/8–10) is highlighted and all three anchor sentences are shown.
8. Focus moves to the question heading on every step; the step animation is disabled under reduced-motion; both self and invited submissions still write correctly (`submit_self_response`; `/api/respond/[token]`).
9. New unit tests pass; census/a11y-census suite untouched; typecheck/lint/build green.

---

## 11. Gates

Run before declaring done (evidence-before-assertion): **typecheck**, **lint**, **unit tests** (full suite green, count not reduced), **production build**. Manual VoiceOver check on the wizard. Do **not** run `test:db`/`supabase test db`. Do not modify census counts to make gates pass.

---

## 12. Standing constraints

- Branch `feat/assessment-ux-improvements` off `6080e86`; commit spec + the `.gitignore` change (which ignores `.superpowers/`) with explicit paths — **never `git add -A`**.
- ⛔ Never commit onto `feat/m6d-i4-unmount-focus` (PR #13 open) · never merge `chore/rename-cairn-to-xpg` · never touch census / a11y-census tests · never `npm run test:db` / `supabase test db`.
- No new dependencies. Native HTML + Tailwind v4 + ARIA only.
- No scale conversion (1–10 stays). No question-metadata migration.
- Do not push or open a PR as part of the spec/plan phase.

---

## 13. Risks & open design decisions (raise at review)

These are consequences of the approved behaviour that the spec resolves but that Natalie should confirm before the plan hardens them:

1. **Wizard advance-gating (§7.2).** Recommended: Next disabled until the current question is answered (guarantees a complete single submit). Alternative: free navigation + block Submit on gaps. Confirm the recommended rule.
2. **Invited-flow name step (§7.4).** Recommended: a dedicated intro step for `requireName`. Alternative: name on the final Submit screen. Confirm placement.
3. **Invitee-lookup surface (§6.3).** RPC vs. RLS `select` — decided in the plan after reading current `invitations` RLS policies; RPC preferred for parity.
4. **Duplicate-send hardening (§6.2).** The UI guards re-sending to an already-pending contact for an area. Whether `create_invitation` should also reject a duplicate `(church, category, pending contact)` at the DB level is optional hardening, not required by this design — flag for a decision.
5. **Growth option storage (§5.3).** Human labels vs. lowercase slugs as the persisted value — both persist fine; pick in the plan (slugs are more future-proof if the value is ever constrained).

None of these change the approved shape; they are the last-mile choices the implementation plan will lock.

---

## 14. Provenance

- **Design approved** through the `superpowers:brainstorming` visual-mockup loop over sessions s16–s23; all three features settled = option A (F1: s18/s20; F2: s21; F3: s23, doubly confirmed via browser click + terminal).
- **Code map** (paths, data model, invitations flow, tokens) from the read-only Explore pass recorded in the s15 handoff; key paths re-verified present at spec time.
- **Copy drafts** for the three help texts from the s16 handoff, shown in the Feature-1 mockup and carried here as the approved starting copy.
- This spec is brainstorming step 6. Next: self-review (step 7) → Natalie reviews the committed spec (step 8) → `superpowers:writing-plans` (step 9, terminal). Do **not** jump to frontend-design / TDD.
