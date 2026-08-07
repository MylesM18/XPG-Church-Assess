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
app), so it can only be rebranded in the Supabase dashboard. The sign-in flow is magic-link
(`signInWithOtp`) + Google OAuth with **no email/password signup**, so **Magic Link is the only
Supabase Auth template that fires** — you don't need to touch Confirm/Invite/Recovery/Change.

### B1. Paste the branded template

1. Supabase Dashboard → **Authentication → Emails → Templates → "Magic Link"** tab.
2. **Subject:** `Your sign-in link for the 360 Church Health Assessment`
3. **Message body (HTML):** replace the entire contents with the template in
   **`docs/owner/magic-link-template.html`** (also inlined below). It is the *same* branded shell as
   the app's other emails, with the button and paste-link pointing at Supabase's own
   `{{ .ConfirmationURL }}` token (the CTA reads **"Sign in to your assessment"**). **Keep the
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
<p style="margin:16px 0 0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:13px;line-height:1.5;color:#565962;">Or paste this link into your browser:<br><span style="word-break:break-all;color:#565962;">{{ .ConfirmationURL }}</span></p>
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

### B3. Add the redirect allow-list URLs

The sign-in code sends users to `…/auth/callback?next=…` after they click the link, so that path
must be allow-listed or Supabase will reject the redirect.

- Supabase Dashboard → **Authentication → URL Configuration**:
  - **Site URL:** `https://www.360churchhealthassessment.com`
  - **Redirect URLs** — add both:
    - `https://www.360churchhealthassessment.com/**`
    - `https://www.360churchhealthassessment.com/auth/callback`

  (The `/**` wildcard already covers the callback path; the explicit entry is belt-and-suspenders.)

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

---

## Quick checklist

- [ ] **A** — Resend domain `360churchhealthassessment.com` verified (DNS).
- [ ] **A** — `INVITE_FROM` + `REMINDER_FROM` (or single `EMAIL_FROM`) set in Vercel **Production**; `RESEND_API_KEY` present; **redeployed**.
- [ ] **A** — Sent myself a real invitation; it arrived branded.
- [ ] **B** — Magic Link template pasted (`{{ .ConfirmationURL }}` intact); subject set.
- [ ] **B** — Supabase sender **name** = "XP Gathering" (optionally custom SMTP via Resend).
- [ ] **B** — Site URL + both redirect URLs added.
- [ ] **C** — OAuth consent: app name, support/developer emails, authorized domain set.
- [ ] **C** — Square ≥120×120 PNG logo uploaded (new owner asset, not the yellow wordmark).
