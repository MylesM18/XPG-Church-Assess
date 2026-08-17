# Owner setup — branded emails + Google Auth / Magic Link

**Date:** 2026-08-06
**Product:** XP Gathering — 360 Church Health Assessment (https://www.360churchhealthassessment.com)
**Companion branch / PR:** `feat/email-auth-personalization`
**Design spec:** `docs/superpowers/specs/2026-08-06-email-auth-personalization-design.md`

This is a **do-this-in-the-dashboard checklist for Natalie.** The code half of this work is
already built, tested, and shipped on the branch — the app's invitation and reminder emails and the
`/sign-in` page now carry the refined XP Gathering identity. What remains can only be done in
**Resend / Vercel / Supabase / Google Cloud Console** with owner access, so it lives here.

> **This task did NOT change any authentication or redirect logic.** The magic-link OTP flow, the
> Google OAuth flow, and `/auth/callback` are untouched. Everything below is **branding and
> configuration only.**

Three parts, independent — do them in any order:

- **Part A — Resend + Vercel:** make the app's own emails send from a real address.
- **Part B — Supabase Auth → Magic Link:** rebrand the sign-in email Supabase sends.
- **Part C — Google Cloud Console:** brand the Google "Continue with Google" consent screen.

---

## Part A — Resend domain + Vercel sender envs

The app sends two emails itself through Resend: the **member invitation** and the **reminder**.
Today they fall back to Resend's shared test address `onboarding@resend.dev`, which **only delivers
to the Resend account owner** — real members never receive it and rely on the copyable link. To
reach real inboxes you need a verified sending domain and a From address on it.

1. **Verify the domain in Resend.**
   - Go to https://resend.com/domains → **Add Domain** → `360churchhealthassessment.com`.
   - Add the DNS records Resend shows (SPF/`TXT`, DKIM `CNAME`s, and the return-path/MX record) at
     your DNS host. Wait for Resend to show the domain **Verified** (can take up to a few hours).

2. **Set the sender env vars in Vercel → Project → Settings → Environment Variables → Production.**
   The code resolves senders in this order: `INVITE_FROM → EMAIL_FROM → onboarding@resend.dev` for
   invitations, and `REMINDER_FROM → EMAIL_FROM → onboarding@resend.dev` for reminders. So either:

   - **Simplest (one address for both):** set `EMAIL_FROM` = `XP Gathering <hello@360churchhealthassessment.com>`
   - **Split (recommended, distinct addresses per type):**
     - `INVITE_FROM` = `XP Gathering <invites@360churchhealthassessment.com>`
     - `REMINDER_FROM` = `XP Gathering <reminders@360churchhealthassessment.com>`

   Any local-part (`hello@`, `invites@`, `reminders@`) works as long as it's on the **verified**
   domain. The `Display Name <addr>` form sets what recipients see as the sender name.

3. **Confirm `RESEND_API_KEY` is set** in the same Production scope (it gates whether the app sends
   at all — without it, sends are skipped and the app shows the copyable link instead).

4. **Redeploy** (env changes only take effect on the next deploy) → **Deployments → Redeploy**.

5. **Smoke test:** send one real invitation to yourself and confirm it arrives from the branded
   address and renders (the official "+ XP GATHERING" logo, ink "Accept your invitation" button,
   signoff "— The XP Gathering team"). If your mail client blocks images by default, the logo falls
   back to the text "XP Gathering".

`.env.example` documents `INVITE_FROM` / `REMINDER_FROM` for reference.

---

## Part B — Supabase Auth → Magic Link email

The **"Send magic link"** button on `/sign-in` triggers an email that **Supabase** sends (not the
app), so it can only be rebranded in the Supabase dashboard.

> **⚠️ Corrected 2026-08-07 — brand TWO templates, not one.**
> An earlier version of this doc claimed Magic Link was the only template that fires. **That was
> wrong**, and it is why a branded template can look like it "didn't apply."
> `app/sign-in/page.tsx` calls `signInWithOtp` **without** `shouldCreateUser: false`, so auth-js
> sends `create_user: true`. For an email address that has **no account yet** — which is every
> first-time invited member — GoTrue treats that request as a **signup** and renders the
> **"Confirm signup"** template. Only a **returning** user gets **"Magic Link"**.
> Brand both, or brand-new invitees keep seeing Supabase's stock unstyled email.

### B1. Paste the branded template (into BOTH tabs)

Two template files live beside this doc, same visual design, different copy for each flow:

| Supabase tab | File | Who receives it | Subject to set |
| --- | --- | --- | --- |
| **Confirm signup** | `docs/owner/confirm-signup-template.html` | **First-time invitees** — the common case | `Confirm your email — 360 Church Health Assessment` |
| **Magic Link** | `docs/owner/magic-link-template.html` | Returning users signing in again | `Your sign-in link — 360 Church Health Assessment` |

1. Supabase Dashboard → **Authentication → Emails → Templates**. Open each tab, paste the matching
   file's full contents into the message body, set the subject, and **Save each tab separately**.
2. **Subject:** `Your sign-in link for the 360 Church Health Assessment`
3. **Message body (HTML):** replace the entire contents with the template in
   **`docs/owner/magic-link-template.html`** (also inlined below). It is the *same* branded shell as
   the app's other emails, with the button and the small "Button not working?" fallback both pointing
   at Supabase's own `{{ .ConfirmationURL }}` token (the CTA reads **"Sign in to your assessment"**).
   Neither prints the URL as visible text — it is the href only, so the ~250-character signed link
   never lands in the reader's face. **Keep the
   `{{ .ConfirmationURL }}` token exactly as-is** — Supabase substitutes the real one-time link when
   it sends.
4. **Save**.

<details>
<summary>Magic Link template HTML (identical to <code>docs/owner/magic-link-template.html</code>)</summary>

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Your sign-in link</title>
</head>
<body style="margin:0;padding:0;background-color:#FBF9F5;">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">Your secure sign-in link for the 360 Church Health Assessment.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBF9F5;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background-color:#FFFFFF;border:1px solid #E4DED3;border-radius:14px;">
<tr>
<td style="padding:40px 40px 0;">
<img src="https://www.360churchhealthassessment.com/landing/logo-dark.png" width="200" height="27" alt="XP Gathering" style="display:block;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
<div style="margin-top:6px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:11px;font-weight:600;letter-spacing:2.4px;color:#565962;">CHURCH HEALTH</div>
</td>
</tr>
<tr>
<td style="padding:28px 40px 0;">
<h1 style="margin:0 0 16px;font-family:Georgia, 'Times New Roman', Times, serif;font-size:24px;font-weight:500;line-height:1.3;color:#1A1C22;">Your sign-in link</h1>
<p style="margin:0 0 16px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#1A1C22;">Click the button below to securely sign in to the 360 Church Health Assessment.</p><p style="margin:0 0 16px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#1A1C22;">This link signs you in without a password. It can be used once and expires shortly — if it no longer works, just request a new link from the sign-in page.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr><td align="center" bgcolor="#1A1C22" style="border-radius:8px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 26px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:15px;font-weight:600;line-height:1;color:#FBF9F5;text-decoration:none;border-radius:8px;">Sign in to your assessment</a></td></tr></table>
<p style="margin:16px 0 0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:13px;line-height:1.5;color:#565962;">Button not working? <a href="{{ .ConfirmationURL }}" style="color:#565962;text-decoration:underline;">Use this link instead</a></p>
</td>
</tr>
<tr>
<td style="padding:28px 40px 40px;">
<div style="border-top:1px solid #E4DED3;padding-top:20px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:13px;line-height:1.6;color:#565962;">
<div>— The XP Gathering team</div>
<div style="margin-top:4px;">&copy; XP Gathering</div>
</div>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
```

</details>

### B2. Set the sender NAME to "XP Gathering"

- With the **default Supabase email service:** Authentication → Emails settings → set the
  **Sender name** to `XP Gathering`.
- **Optional but recommended for deliverability + a branded From address:** configure **Custom SMTP**
  (Authentication → Emails → SMTP Settings) pointed at Resend, with **Sender name** `XP Gathering`
  and a **Sender email** on the verified `360churchhealthassessment.com` domain (Part A). Supabase's
  built-in email service is rate-limited and best for testing; custom SMTP is the reliable path for
  real member volume.

### B2a. What the Supabase auth email can and cannot say

The auth email **cannot** carry the church name, the member's role, or any other personalization.
The sign-in call sends no user metadata (auth-js fills `data: {}`), so the only values Supabase can
interpolate are generic ones: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`,
`{{ .Email }}`. No dashboard setting changes this — it would take a code change to thread church and
role through as user metadata.

Church- and role-specific wording already lives where it belongs: the app's **own** invitation email
(`lib/email/send-member-invitation.ts`), sent via Resend. Treat the Supabase auth email as a plain
branded "here's your sign-in link" and keep the personality in the invitation.

### B3. Add the redirect allow-list URLs

The sign-in code sends users to `…/auth/callback?next=…` after they click the link, so that path
must be allow-listed or Supabase will reject the redirect.

- Supabase Dashboard → **Authentication → URL Configuration**:
  - **Site URL:** `https://www.360churchhealthassessment.com`
  - **Redirect URLs** — add both:
    - `https://www.360churchhealthassessment.com/**`
    - `https://www.360churchhealthassessment.com/auth/callback`

  (The `/**` wildcard is the entry that actually matters. The app emits a **query-bearing** URL —
  `…/auth/callback?next=…` — and a bare `…/auth/callback` entry with no wildcard does not match it.
  If `redirect_to` fails to match the allow-list, **Supabase silently ignores it and sends the user
  to the Site URL instead, raising no error** — which lands an invited member on the marketing home
  page rather than their assessment. Also add the apex `https://360churchhealthassessment.com/**`
  and `https://*.vercel.app/**` if the app is ever served from those hosts.)

### B3a. `APP_URL` must match an allow-listed origin

Invitation links are built from `APP_URL` (`app/app/[churchId]/access/actions.ts`), whose code
fallback is `http://127.0.0.1:3000`. The invitee's browser origin at sign-in comes from that link,
and `emailRedirectTo` is derived from it — so if `APP_URL` is unset, apex-without-`www`, or an old
`*.vercel.app` host, the emitted `redirect_to` cannot match a `www`-only allow-list and the redirect
silently falls back to the Site URL.

- Vercel → Production env: set **`APP_URL`** to exactly `https://www.360churchhealthassessment.com`
  (same origin as the Site URL), then **redeploy**.

### B4. Known caveat — Gmail link pre-fetch / `otp_expired` (unchanged, just re-flagged)

Some inbox providers and corporate mail scanners (notably **Gmail**) **pre-fetch links inside
emails**. Because a magic link is a **one-time** token, a pre-fetch can silently consume it before
the recipient clicks, and the real click then lands on `/sign-in` with an `otp_expired` /
`?error=auth` signal. **This is a pre-existing property of Supabase magic links and is not caused by
this rebrand.** The app already surfaces the reason clearly on `/sign-in` and the user can simply
request a fresh link. See the prior investigation notes (`project_xpg_auth_redirect_bug`). A durable
fix — if ever pursued — would be a separate change to the verification flow (e.g. a `token_hash` /
`verifyOtp` server route) and is **out of scope for this branding task; auth logic was not
modified.**

---

## Part C — Google Cloud Console → OAuth consent screen

The **"Continue with Google"** button already carries the real 4-color Google "G" in-app. The screen
Google itself shows during login ("XP Gathering wants to access your Google Account") is configured
in **Google Cloud Console**, on the same GCP project whose OAuth client ID/secret power Supabase's
Google provider.

1. Google Cloud Console → select the project that holds the app's OAuth client → **APIs & Services →
   OAuth consent screen** (Branding).
2. Set:
   - **App name:** `XP Gathering`
   - **User support email:** an address you monitor (e.g. `natalieamagee@gmail.com` or a
     `@360churchhealthassessment.com` address).
   - **Authorized domain:** `360churchhealthassessment.com`
   - **Developer contact information:** your email.
3. **App logo:** upload a **square PNG, at least 120×120px** (Google requires roughly square; larger
   like 512×512 is fine).
   - ⚠️ The existing master logo at `public/landing/logo-{dark,light}.png` is a **750×100 wide
     wordmark** and **will not fit** Google's square requirement — and it's the **yellow** lockup,
     which is off the app's refined palette. **Provide a new square mark** (e.g. the three-circle
     mark, or "XP" in the ink `#1A1C22` on cream `#FBF9F5`). This is an **owner-supplied asset** —
     it is not in the repo.
4. **Save.** If the app's publishing status is "Testing", either add member emails as test users or
   **Publish** the app so any user can complete Google sign-in. (Uploading a logo / changing branding
   on a public app can trigger a Google verification review — allow lead time before launch.)

### C2. OAuth client URLs — the field everyone gets backwards

**Google Cloud Console → APIs & Services → Credentials → your Web application OAuth 2.0 Client ID.**

> **⚠️ The Authorized redirect URI is a SUPABASE URL, not this app's URL.**
> Google redirects the user back to **Supabase**, and Supabase then redirects on to the app. Putting
> `…/auth/callback` on the app's own domain here is the single most common way to break Google
> sign-in, and it produces a `redirect_uri_mismatch` error from Google.

| Google field | What goes in it |
| --- | --- |
| **Authorized redirect URIs** | `https://<project-ref>.supabase.co/auth/v1/callback` — **only this** |
| **Authorized JavaScript origins** | `https://www.360churchhealthassessment.com` (the app's origin, no path, no trailing slash) |

Find `<project-ref>` without guessing: Supabase Dashboard → **Authentication → Providers → Google**
displays the exact **Callback URL (for OAuth)** with a copy button. Copy it from there and paste it
straight into Google. It is the same value as your Project URL (Project Settings → API) with
`/auth/v1/callback` appended.

If the app is also served from the apex domain or from Vercel previews, add those origins to
**Authorized JavaScript origins** as well — but **never** add them to Authorized redirect URIs. That
field stays a single Supabase URL forever.

### C3. Three different URL settings — don't cross-wire them

These live in three separate consoles and do three different jobs:

| Setting | Where | Value |
| --- | --- | --- |
| Authorized redirect URIs | Google Cloud Console | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Redirect URLs (allow-list) | Supabase → Auth → URL Configuration | `https://www.360churchhealthassessment.com/**` |
| Site URL (fallback) | Supabase → Auth → URL Configuration | `https://www.360churchhealthassessment.com` |

Google's field controls *Google → Supabase*. Supabase's allow-list controls *Supabase → this app*,
and it is what governs whether an invited member lands on their assessment or gets silently dumped on
the marketing home page (see B3).

---

## Quick checklist

- [ ] **A** — Resend domain `360churchhealthassessment.com` verified (DNS).
- [ ] **A** — `INVITE_FROM` + `REMINDER_FROM` (or single `EMAIL_FROM`) set in Vercel **Production**; `RESEND_API_KEY` present; **redeployed**.
- [ ] **A** — Sent myself a real invitation; it arrived branded.
- [ ] **B** — **"Confirm signup"** template pasted (`{{ .ConfirmationURL }}` intact); subject set.
      ← *this is the one first-time invitees actually receive*
- [ ] **B** — **"Magic Link"** template pasted (`{{ .ConfirmationURL }}` intact); subject set.
      ← *returning users*
- [ ] **B** — Supabase sender **name** = "XP Gathering" (optionally custom SMTP via Resend).
- [ ] **B** — Site URL + redirect URLs added, **including the `/**` wildcard entry**.
- [ ] **B** — `APP_URL` set in Vercel **Production** to the same origin as the Site URL; **redeployed**.
- [ ] **C** — OAuth consent: app name, support/developer emails, authorized domain set.
- [ ] **C** — Google **Authorized redirect URIs** = `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase URL, **not** the app's).
- [ ] **C** — Google **Authorized JavaScript origins** = `https://www.360churchhealthassessment.com`.
- [ ] **C** — Square ≥120×120 PNG logo uploaded (new owner asset, not the yellow wordmark).
