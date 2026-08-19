# Owner setup — branded emails + Google Auth / Magic Link

**Date:** 2026-08-06
**Product:** XP Gathering — 360 Church Health Assessment (https://www.360churchhealthassessment.com)
**Companion branch / PR:** `feat/email-auth-personalization`
**Design spec:** `docs/superpowers/specs/2026-08-06-email-auth-personalization-design.md`

This is a **do-this-in-the-dashboard checklist for Natalie.** The code half of this work is
already built, tested, and shipped on the branch — the app's invitation and reminder emails and the
`/sign-in` page now carry the refined XP Gathering identity. What remains can only be done in
**Resend / Vercel / Supabase / Google Cloud Console** with owner access, so it lives here.

> **As first written (2026-08-06) this task changed no authentication or redirect logic** — it was
> branding and configuration only.
>
> **⚠️ Amended 2026-08-17.** A later change moved the emailed sign-in link off
> `oydjoikfwvzttyhvfxcn.supabase.co` and onto our own `/auth/confirm` route, so **Part B is no
> longer branding-only**. The two templates now carry a different link (B1), the allow-list note
> reads differently (B3), and the Gmail pre-fetch caveat is now mitigated rather than open (B4).
> Part A and Part C are unaffected. If you already pasted the older templates, re-paste them.

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

> **Updated 2026-08-18** — the Confirm-signup template is now the first-time onboarding welcome (steps + overview). Re-paste it; Magic Link is unchanged.

Two template files live beside this doc, same visual design, different copy for each flow:

| Supabase tab | File | Who receives it | Subject to set |
| --- | --- | --- | --- |
| **Confirm signup** | `docs/owner/confirm-signup-template.html` | **First-time users** — a leader beginning the assessment, or a first-time invitee | `Welcome — your first step in the 360 Church Health Assessment` |
| **Magic Link** | `docs/owner/magic-link-template.html` | Returning users signing in again | `Your sign-in link — 360 Church Health Assessment` |

1. Supabase Dashboard → **Authentication → Emails → Templates**. Open each tab, paste the matching
   file's full contents into the message body, set the subject, and **Save each tab separately**.
2. **Subject:** `Your sign-in link for the 360 Church Health Assessment`
3. **Message body (HTML):** replace the entire contents with the template in
   **`docs/owner/magic-link-template.html`** (also inlined below). It is the *same* branded shell as
   the app's other emails, with the button and the small "Button not working?" fallback both pointing
   at **our own** `/auth/confirm` route (the CTA reads **"Sign in to your assessment"**). Neither
   prints the URL as visible text — it is the href only, so the signed link never lands in the
   reader's face.

   **Paste the link exactly as written**, in both tabs, all four tokens intact:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
   ```

   Supabase substitutes the real values when it sends. Two things not to "tidy":
   - The href **must start with `{{ .SiteURL }}`**. Beginning it with any other template variable
     trips a known Go `html/template` sanitization bug that renders the entire link as `#ZgotmplZ`.
   - `type=email` stays `email` in **both** tabs. It is the generic type that verifies the Magic
     Link and the Confirm-signup token alike, so neither template has to guess which one it is.
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr><td align="center" bgcolor="#1A1C22" style="border-radius:8px;"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" style="display:inline-block;padding:13px 26px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:15px;font-weight:600;line-height:1;color:#FBF9F5;text-decoration:none;border-radius:8px;">Sign in to your assessment</a></td></tr></table>
<p style="margin:16px 0 0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:13px;line-height:1.5;color:#565962;">Button not working? <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" style="color:#565962;text-decoration:underline;">Use this link instead</a></p>
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

#### B1a. The Confirm-signup template now holds TWO emails (added 2026-08-19)

> **Action required: re-paste `docs/owner/confirm-signup-template.html`.** Everything below is
> already live in the code; none of it reaches an inbox until the template is re-pasted.

**The problem it fixes.** An invited member or co-admin who confirmed their account received the
*admin's* onboarding email — "Add your church", "invite the leader who knows each area best",
"Receive your diagnosis". An invitee performs none of those steps. Supabase renders exactly one
**Confirm signup** template for every new account, so the two emails have to live in one file.

**How it decides.** The entry form sends a flag with the sign-in request, which Supabase stores on
the new account as `user_metadata` and exposes to the template as `{{ .Data.invited }}`:

```
{{ if .Data.invited }}   …the invited leader's copy…
{{ else }}               …the first-time admin's copy…
{{ end }}
```

Three of these blocks exist in the file — preview text, heading, body. **Do not "tidy" them away**,
and do not reformat the `{{ … }}` tokens; Supabase substitutes them at send time and a broken
conditional breaks the whole email, not one line. The button and the "Button not working?" link sit
*outside* both arms on purpose, so there is still exactly one sign-in link to get right.

**Verify both arms after pasting** (the two halves fail independently):

1. **Admin arm** — sign up from the homepage with a **new address** of your own that has never been
   used here. Expect "Welcome — let's begin." and the four steps ending in *Receive your diagnosis*.
2. **Invited arm** — send yourself an invitation from Access, open it in a private window, click
   **Sign in to accept**, and enter a **different** new address. Expect "You're invited — let's
   begin." and three steps ending in *Your answers join the whole*.

If the invited arm shows the admin copy, the paste did not take. If **both** arms render at once,
the conditional was flattened — re-paste the file unedited.

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
interpolate are generic ones: `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}`,
`{{ .Token }}`, `{{ .Email }}`. No dashboard setting changes this — it would take a code change to thread church and
role through as user metadata.

Church- and role-specific wording already lives where it belongs: the app's **own** invitation email
(`lib/email/send-member-invitation.ts`), sent via Resend. Treat the Supabase auth email as a plain
branded "here's your sign-in link" and keep the personality in the invitation.

### B3. Add the redirect allow-list URLs

Both sign-in flows hand Supabase a `redirect_to` on this app's domain, and a value that misses the
allow-list is silently discarded (see the warning below). The two flows now send **different**
shapes:

- **Magic link / Confirm signup** — the app sends the member's **real destination**: usually
  `https://www.360churchhealthassessment.com/get-started`, or a deep link such as
  `…/accept-invitation/<token>`. Supabase renders it into the emailed link as `{{ .RedirectTo }}`,
  and `/auth/confirm` forwards the member there once the token verifies.
- **Google OAuth** — unchanged: `…/auth/callback?next=…`.

- Supabase Dashboard → **Authentication → URL Configuration**:
  - **Site URL:** `https://www.360churchhealthassessment.com`
  - **Redirect URLs** — add both:
    - `https://www.360churchhealthassessment.com/**`
    - `https://www.360churchhealthassessment.com/auth/callback`

  (The `/**` wildcard is the entry that actually matters. The app emits both **query-bearing** and
  **deep** URLs — `…/auth/callback?next=…` for Google, `…/accept-invitation/<token>` for an invited
  member — and a bare `…/auth/callback` entry with no wildcard matches neither.
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

### B4. Gmail link pre-fetch / `otp_expired` — now mitigated (amended 2026-08-17)

Some inbox providers and corporate mail scanners (notably **Gmail**) **pre-fetch links inside
emails**. Because a magic link is a **one-time** token, a pre-fetch could silently consume it before
the recipient clicked, and the real click then landed on `/sign-in` with an `otp_expired` /
`?error=auth` signal. See the prior investigation notes (`project_xpg_auth_redirect_bug`).

The `/auth/confirm` link in B1 closes this. **Be clear about why, because the obvious explanation is
wrong:** moving to `token_hash` on its own would **not** have fixed it — a `token_hash` link is
still a single-use GET, and a prefetcher burns it identically. What fixes it is that
**`/auth/confirm` verifies nothing on GET.** It renders a "Signing you in…" card whose form is
POSTed to `/auth/confirm/verify`, and that POST is the only thing that spends the token. Prefetchers
issue GETs, never POSTs, so a scanner that fetches the link leaves the token unspent. The page
auto-submits on load, so a real member sees roughly a half-second flash; a **Continue** button is
there for anyone whose browser never runs the script.

Residual risk: a scanner that both executes JavaScript **and** follows the resulting POST would
still consume the token. The app keeps surfacing the reason on `/sign-in` so a member in that case
can request a fresh link.

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
- [ ] **B** — **"Confirm signup"** template pasted (the `/auth/confirm` link intact, all four `{{ … }}` tokens, `type=email`); subject set.
- [ ] **B1a** — **"Confirm signup"** RE-pasted since 2026-08-19, so invited leaders stop receiving the admin's onboarding steps; both arms verified per B1a.
      ← *this is the one first-time invitees actually receive*
- [ ] **B** — **"Magic Link"** template pasted (same `/auth/confirm` link, also `type=email`); subject set.
      ← *returning users*
- [ ] **B** — Hovered the button in a delivered test email and confirmed it reads `https://www.360churchhealthassessment.com/auth/confirm?…`, **not** `#ZgotmplZ` and not `*.supabase.co`.
- [ ] **B** — Supabase sender **name** = "XP Gathering" (optionally custom SMTP via Resend).
- [ ] **B** — Site URL + redirect URLs added, **including the `/**` wildcard entry**.
- [ ] **B** — `APP_URL` set in Vercel **Production** to the same origin as the Site URL; **redeployed**.
- [ ] **C** — OAuth consent: app name, support/developer emails, authorized domain set.
- [ ] **C** — Google **Authorized redirect URIs** = `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase URL, **not** the app's).
- [ ] **C** — Google **Authorized JavaScript origins** = `https://www.360churchhealthassessment.com`.
- [ ] **C** — Square ≥120×120 PNG logo uploaded (new owner asset, not the yellow wordmark).
