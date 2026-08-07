# Design — XPG email customization + Google Auth / magic-link personalization

**Date:** 2026-08-06
**Product:** XP Gathering — 360 Church Health Assessment (https://www.360churchhealthassessment.com)
**Branch:** `feat/email-auth-personalization` (off master `9269870`)
**Status:** Approved (brainstorm 2026-08-06). Ready for implementation plan.

---

## Goal

Give the app's outgoing emails and the sign-in experience a consistent, branded, warm
identity. Three surfaces with different owners:

- **A. App-sent Resend emails** — in-repo code, fully shippable by the agent.
- **B. Supabase Auth Magic Link email** — dashboard config; agent writes HTML/copy, owner pastes.
- **C. Google Auth login** — the `/sign-in` page is in-repo (agent restyles); the Google OAuth
  consent screen is Google Cloud Console (owner-only; agent writes the steps).

## Locked decisions (from brainstorm)

| Decision | Choice |
| --- | --- |
| Scope this round | Everything: ship A + C in-repo; write B (Magic Link) + Google consent copy for owner to paste |
| Visual identity | **Refined app sub-brand** — cream/ink/sage, serif wordmark "XP Gathering" + "CHURCH HEALTH" eyebrow, three-circle mark. **No yellow, no berry.** |
| Email voice | Warm & encouraging, **signed "— The XP Gathering team"** (no personal name) |
| Email footer | **No mailing address** (owner has none). Footer = signoff + "© XP Gathering". |
| Sign-in restyle depth | **Warmer welcome** — wordmark + eyebrow, warmer headline + one reassurance line, real Google "G" icon. Keep existing tokens + a11y. |
| Sender addresses | **Split by type** — `INVITE_FROM` (invites) / `REMINDER_FROM` (reminders), each falling back to `EMAIL_FROM` then `onboarding@resend.dev`. |
| Supabase Auth templates in scope | **Magic Link only** — the sign-in flow uses `signInWithOtp` + Google OAuth; no email/password signup, so no other Supabase Auth email fires. |

## Current state (grounding)

- `lib/email/send-member-invitation.ts` — sends bare `<p>…</p>`. Args `{ to, link, churchName, role }`.
  `From = EMAIL_FROM || 'onboarding@resend.dev'` (PR #44, merged). Tested by
  `tests/access/send-member-invitation.test.ts`.
- `lib/email/send-reminder.ts` — sends `<p>${text}</p>`. Args `{ to, subject, text }`.
  `From = EMAIL_FROM || 'onboarding@resend.dev'`. Tested by `tests/email/send-reminder.test.ts`.
- Reminder composition: `app/api/cron/reminders/route.ts` → `lib/deadlines/reminders.ts`
  (`planCompletionReminders` / `planInviteReminders`) yields `ReminderSend { church_id, user_id,
  to, subject, text }`. **No per-user deep link and no church name** in the reminder payload — the
  reminder CTA therefore links to the app base URL, not a deep link.
- App base URL env: **`APP_URL`** (`.env.example` → `http://127.0.0.1:3000`), production fallback
  `https://www.360churchhealthassessment.com`.
- `app/sign-in/page.tsx` — client page; `signInWithOtp` (magic link) + `signInWithOAuth` Google.
  Uses tokens (`ink`, `paper`, `line`, `sand`, `berry`, `font-display`/`font-body`), focus
  management on `sent`, `parseAuthError` dual-channel error surfacing, `resolveNext` redirect guard,
  `LiveStatus`. **All of this must be preserved.**
- Design tokens (`app/globals.css` `@theme`): `paper #FBF9F5`, `ink #1A1C22`, `ink-soft #565962`,
  `line #E4DED3`, `sage #4E6B60`, `sand #EEE8DD`, `berry #8E2B3E` **(RESERVED — never a brand tile)**,
  fonts Fraunces (display) / Hanken (body), `--radius-card: 14px`.
- Logos: `public/landing/logo-{dark,light}.png` are the **yellow "+ XP GATHERING" master logo**
  (750×100) — **NOT used** for this work (yellow is off-palette). Marketing header uses an inline
  three-circle SVG + serif wordmark; that refined identity is what emails/sign-in mirror.

## Architecture

One real decision: **a shared brand-shell helper** so both emails share one source of brand truth.

### `lib/email/layout.ts` (new)

```ts
export interface EmailCta { label: string; url: string }
export interface BrandedEmailArgs {
  previewText: string          // hidden inbox preview (preheader)
  heading: string              // serif H1 inside the card
  paragraphs: string[]         // body paragraphs (already plain text; escaped into <p>)
  cta?: EmailCta               // optional ink button
  fallbackLinkLabel?: string   // e.g. "Or paste this link into your browser:" (invite only)
  signoff?: string             // default "— The XP Gathering team"
}
export function renderBrandedEmail(args: BrandedEmailArgs): { html: string; text: string }
```

- **HTML:** table-based, **all styles inline** (email clients strip `<style>`/classes and SVG).
  Structure: full-width `#FBF9F5` page → centered ~560px card (`#FFFFFF` or `#FBF9F5`, 14px radius,
  1px `#E4DED3` border, generous padding) → header (serif **"XP Gathering"** wordmark in a
  Georgia/Times serif stack + `#565962` letter-spaced "CHURCH HEALTH" eyebrow; **no external image**)
  → heading (serif) → paragraphs (Hanken→system sans stack, `#1A1C22`) → optional **bulletproof
  ink button** (`background:#1A1C22; color:#FBF9F5; border-radius:8px`; padded `<a>` in a table
  cell — no VML required for the shapes we use) → optional fallback link line → footer (`#565962`
  small: signoff + "© XP Gathering"). Hidden preheader span. **No mailing address. No berry, no yellow.**
- **text:** plaintext mirror — heading, paragraphs, `CTA label: url`, fallback link, signoff.
  Every send sets both `html` and `text` (deliverability + accessibility).
- **Escaping:** all interpolated values (`churchName`, `role`, banner `text`) HTML-escaped in the
  `html` branch to prevent broken markup / injection.

### Sender split

Small helper (in `layout.ts` or a tiny `from.ts`):
`inviteFrom() = INVITE_FROM || EMAIL_FROM || 'onboarding@resend.dev'`,
`reminderFrom() = REMINDER_FROM || EMAIL_FROM || 'onboarding@resend.dev'`.
Update `.env.example` with commented `INVITE_FROM=` / `REMINDER_FROM=` and a note that both fall
back to `EMAIL_FROM`.

### `send-member-invitation.ts`

Compose via `renderBrandedEmail`:
- heading: `You're invited to help lead ${churchName}`
- paragraphs: warm 1–2 lines naming the role (`roleLabel(role)`) and what the assessment is.
- cta: `{ label: 'Accept your invitation', url: link }`
- fallback link line (paste-in-browser)
- signoff default
- `from = inviteFrom()`, subject unchanged (`You're invited to help lead ${churchName}`).
- **Preserve** the soft-fail contract: no `RESEND_API_KEY` → `{ ok:false }`; Resend error/throw → `{ ok:false }`.

### `send-reminder.ts`

Compose via `renderBrandedEmail`:
- heading: short warm heading (e.g. `A gentle reminder`), subject unchanged (caller-supplied).
- paragraphs: `[text]` (the existing banner sentence — HTML-escaped).
- cta: `{ label: 'Open your assessment', url: appUrl() }` where
  `appUrl() = APP_URL?.trim() || 'https://www.360churchhealthassessment.com'`.
- signoff default; `from = reminderFrom()`.
- **Preserve** soft-fail contract. `ReminderSend` shape and the pure planners in
  `lib/deadlines/reminders.ts` are **unchanged** (no new fields threaded through the cron).

### `app/sign-in/page.tsx`

- Add above the H1: the serif wordmark **"XP Gathering"** + `#565962` "CHURCH HEALTH" eyebrow
  (reuse the marketing header's inline three-circle SVG mark, or a simple lockup — in-app SVG is fine).
- Warmer headline (replace "Sign in to XP Gathering" with e.g. "Welcome back" / "Sign in to your
  assessment" — final copy in plan) + one reassurance line: **"We'll email you a secure sign-in
  link — no password needed."**
- Real **Google "G"** icon (inline 4-color SVG) on the "Continue with Google" button.
- **Do not touch:** `sendMagicLink`, `signInWithGoogle`, `callbackUrl`/`resolveNext`, `parseAuthError`
  dual-channel effect, focus-on-`sent` effect, `?email=` prefill, `LiveStatus`, existing tokens,
  focus-visible styles. Restyle is additive/visual only.

## B + Google — deliverables the agent produces for the owner to apply

Produce as a single owner-facing doc (e.g. `docs/owner/email-auth-owner-setup-2026-08-06.md`) plus,
for Magic Link, a standalone pasteable `.html`:

1. **Supabase → Auth → Email Templates → Magic Link** — branded HTML (same shell, inline styles)
   using the Supabase `{{ .ConfirmationURL }}` token; **sender name** "XP Gathering"; note to add
   redirect allow-list URLs: `https://www.360churchhealthassessment.com/**` and the `/auth/callback`
   path. Re-flag the known **gmail-prefetch / `otp_expired`** caveat (see
   `project_xpg_auth_redirect_bug.md`) — do not change auth logic as part of this task.
2. **Google Cloud Console → OAuth consent screen** — step list: app name "XP Gathering", user-facing
   product name, authorized domain `360churchhealthassessment.com`, support + developer contact
   emails, and a **square ≥120×120 PNG logo** (owner asset — the 750×100 wordmark won't fit).

## Testing (TDD)

- Extend `tests/access/send-member-invitation.test.ts`: assert branded shell markers (heading,
  CTA label + href = link, signoff, wordmark), `from` uses `INVITE_FROM` when set, and the
  preserved soft-fail behavior (no key → `{ok:false}`, Resend error → `{ok:false}`).
- Extend `tests/email/send-reminder.test.ts`: assert shell markers, CTA → `appUrl()`, `from` uses
  `REMINDER_FROM` when set, soft-fail preserved.
- New `tests/email/layout.test.ts`: `renderBrandedEmail` returns both `html` + `text`; escapes
  interpolation; omits CTA when absent; default signoff; no `#8E2B3E`/berry and no yellow in output.
- Sign-in: a lightweight render assertion (wordmark/eyebrow/reassurance text present, Google button
  still present) if the existing test setup supports rendering the client page; otherwise a snapshot
  of the added static markup.

## Verification (agent)

`npx vitest run` (targeted files, then full), `npx tsc --noEmit`, `npm run build`. Render each email
to a scratchpad `.html` and screenshot for a visual check. Run the dev server and screenshot
`/sign-in` (light; check focus/keyboard). **Agent cannot send real mail** — no Resend key locally.

## Owner TODO (dashboard / secrets — agent cannot do)

- Verify Resend domain `360churchhealthassessment.com` (DNS) and set `INVITE_FROM` +
  `REMINDER_FROM` (or a single `EMAIL_FROM`) in **Vercel Production**, then redeploy.
- Paste the Magic Link template HTML + set sender name "XP Gathering" + add redirect allow-list URLs
  in **Supabase → Auth**.
- Configure the **Google OAuth consent screen** branding + upload a square logo.

## Non-goals

- No change to auth/redirect logic (magic-link OTP flow untouched — only copy/branding).
- No new runtime dependencies (Resend already present; hand-rolled table HTML).
- No change to the reminder planners / cron payload shape / dedup logic.
- Not touching the yellow master logo or landing page.
- No mailing address anywhere.

## Guardrails (carry into implementation)

Agent never runs `npm run test:db` / `supabase db push|reset`; never merges/pushes to `master` or
force-pushes (feature-branch push + `gh pr create` only; owner merges); explicit git paths only;
never stage `.claude/`; no new runtime deps; implementers never run git — the controller commits by
explicit path. CI "Vercel unstable"/`UNSTABLE` = `cornerleague` artifact, not a code failure.
