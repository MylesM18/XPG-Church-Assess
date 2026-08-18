# First-time vs. returning entry — design

**Date:** 2026-08-18 · **Status:** implemented on `feat/first-time-signup-entry`, awaiting Natalie's review

## Problem

`BEGIN THE ASSESSMENT →` (homepage, two CTAs) links to `/get-started`, which redirects an
unauthenticated visitor to `/sign-in?next=/get-started`. A first-time leader therefore meets the
page headed **"Welcome back"** — the wrong greeting for someone taking their first step. The
same page also carries a mechanical sub-line ("We'll email you a secure sign-in link — no password
needed") where a returning leader deserves a greeting.

The two Supabase auth emails already split by user existence — a first-time address receives the
**Confirm signup** template, a returning one receives **Magic Link** — but the Confirm-signup copy
is a bare "Confirm your email" with no orientation.

## Goals

1. `BEGIN THE ASSESSMENT →` lands on a **first-time** page: same passwordless mechanics as
   `/sign-in`, greeted in the brand voice as a first visit.
2. `SIGN IN` keeps **"Welcome back"**; the sub-line becomes a welcome-back greeting.
3. The **first-time** email becomes an onboarding welcome: what the assessment means to them, the
   steps ahead. The **returning** email (Magic Link) stays as it is today.

## Non-goals

- Cross-links between the two pages ("Already have an account?" etc.) — not asked for.
- ~~The invitation flow (`/accept/[token]` → `/sign-in?email=…`) keeps pointing at `/sign-in`.~~
  **Done as a follow-up (2026-08-18, after PR #74 merged):** the signed-out "Sign in to accept"
  link now goes to `/sign-up?next=…&email=…` — invitees are almost always first-time users. The
  `wrong_email` state's "Go to sign in" link stays on `/sign-in` (that visitor *is* signed in).
- Any change to auth mechanics, redirect guards, templates' link string, or Google OAuth.

## Design

### Routes

| Entry | Route | Heading | Sub-line |
| --- | --- | --- | --- |
| `BEGIN THE ASSESSMENT →` (both homepage CTAs), `/get-started` unauthenticated redirect, signed-out `/accept/[token]` "Sign in to accept" (follow-up, see Non-goals) | **`/sign-up`** (new) | "Glad you're here." | first-time greeting |
| `SIGN IN` (homepage header, site header), sign-out, auth-error bounces, membership guard, `/accept/[token]` wrong-account link | `/sign-in` (existing) | "Welcome back" | welcome-back greeting |

Both default `next` to `/get-started`; `/get-started` still routes an existing member to their
church dashboard, so a returning leader who clicks *Begin* is not harmed — they simply read the
first-time greeting once and land in the right place.

### Shared component

`app/sign-in/page.tsx` today holds all the mechanics (OTP send, Google OAuth, `resolveNext`
guard, dual-channel `parseAuthError`, `?email=` prefill, focus-on-sent). Rather than fork ~180
lines, extract them into **`components/auth/passwordless-entry.tsx`** (client component) that
takes only copy:

```ts
type PasswordlessEntryCopy = {
  heading: string        // <h1>
  greeting: string       // <p> under the heading
  submitLabel: string    // magic-link button
  sentMessage: string    // replaces the form after send
}
```

`app/sign-in/page.tsx` and `app/sign-up/page.tsx` become thin wrappers that pass their copy.
Nothing else in the component varies between the two pages. The two source-reading tripwire tests
that today read `app/sign-in/page.tsx` are re-pointed at the shared component; the branding test's
"passwordless reassurance" assertion is updated to the new sign-in greeting.

### Copy (brand voice: pastoral, relational, hopeful, beside the leader)

**`/sign-up`**
- h1: `Glad you're here.`
- greeting: `You're one step from a clearer picture of your church's health. Enter your email and we'll send a secure link to begin — no password to create.`
- submit: `Send my link`
- sent: `Your link is on its way. Check your inbox — the email walks you through what happens next. You can close this tab.`

**`/sign-in`**
- h1: `Welcome back` (unchanged)
- greeting (replaces the sub-line): `Good to have you back. Your church's assessment is right where you left it — enter your email and we'll send a secure sign-in link, no password needed.`
- submit: `Send magic link` (unchanged)
- sent: `Check your email for a magic link. You can close this tab.` (unchanged)

### Emails

**Confirm signup** (`docs/owner/confirm-signup-template.html`) — rewritten as the onboarding
welcome. Same shell, same link string (the tests require the two templates' hrefs to be identical
and exactly two anchors), new copy:

- title / preheader: `Welcome — your first step in the 360 Church Health Assessment.`
- h1: `Welcome — let's begin.`
- overview (one short paragraph): the assessment walks the journey people take through the church
  — Welcome, Belong, Become, Build, Multiply — and finds the earliest gap limiting discipleship, so
  leadership knows what to strengthen first.
- "What happens next" — four numbered steps (table-safe markup): confirm email (this link signs you
  in, no password) → add your church (~2 min; benchmark against churches like yours) → answer the
  eight areas or invite the leader who knows each area best via a private link → receive the
  diagnosis: one next-step priority, not a scorecard.
- one line for invitees: the same link takes an invited leader straight to their invitation.
- CTA: `Confirm and begin`
- footer: unchanged safety line + sign-off.

**Magic Link** (`docs/owner/magic-link-template.html`) — unchanged.

Owner doc `docs/owner/email-auth-owner-setup-2026-08-06.md`: update the Confirm-signup row (who
receives it → first-time leaders and invitees; suggested subject → `Welcome — your first step in
the 360 Church Health Assessment`) and note that the Confirm-signup template must be re-pasted.
The dashboard template stays inert until Natalie re-pastes it.

### Tests

- Re-point `tests/auth/sign-in-branding.test.ts` and `tests/auth/sign-in-magic-link-redirect.test.ts`
  at the shared component; add assertions that both pages render it with their headings.
- New `tests/auth/sign-up-entry.test.ts`: `/sign-up` page exists, passes "Glad you're here.",
  homepage CTAs link to `/sign-up`, `/get-started` (page + action) redirect unauthenticated to
  `/sign-up?next=/get-started`, and `SIGN IN` still links to `/sign-in`.
- `tests/email/auth-template-links.test.ts` continues to pass unchanged (link string identical,
  two anchors, no raw URL); add an assertion that the Confirm-signup copy is the onboarding
  welcome (contains "What happens next") and Magic Link is untouched.

### Verification

`npm test`, `npm run typecheck`, `npm run lint`, then a browser check of `/sign-up` and `/sign-in`
on the `cairn-dev` preview.
