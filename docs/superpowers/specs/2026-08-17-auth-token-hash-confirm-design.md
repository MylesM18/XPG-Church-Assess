# Design — move the auth emails onto our own domain (`token_hash` + POST interstitial)

**Date:** 2026-08-17
**Branch:** `feat/auth-token-hash-confirm` (off `origin/master` `6b3626f`)
**Owner decision:** Natalie chose **option B** (confirm route + POST interstitial), auto-submit
variant, and accepted production-only testing. Both choices are recorded in §6.

---

## 1. Goal

The sign-in link in the Supabase auth emails currently points at
`https://oydjoikfwvzttyhvfxcn.supabase.co/auth/v1/verify?token=pkce_…`. A recipient hovering the
button sees a bare Supabase host, not the product. Move the link onto
`https://www.360churchhealthassessment.com` so it reads as ours.

## 2. What this does and does not buy

| | |
| --- | --- |
| ✅ | Link is on our domain — trust, brand, no bare `*.supabase.co`. |
| ✅ | Fixes **cross-browser / cross-device** sign-in. PKCE needs the `code_verifier` cookie in the browser that *requested* the link; `verifyOtp({ token_hash, type })` does not. Requesting on desktop and opening the email on a phone fails today. |
| ✅ | With the interstitial (§4), **defeats link-prefetch token burn** — the thing that produces `otp_expired` on a link the member never clicked. |
| ❌ | `token_hash` **on its own** does not stop prefetch. It is still a single-use GET; a prefetcher burns it identically. Only the POST interstitial closes that. |

> **Correction carried forward.** A previous session told Natalie that `token_hash` "would likely
> also dodge the Gmail link-prefetch token burn." That was wrong, and it is corrected here: the
> prefetch win comes from the interstitial, not from `token_hash`.
>
> Memory `project_xpg_auth_redirect_bug` records "the `token_hash` migration idea is WRONG — do not
> build it." Read in its original scope that verdict rejected `token_hash` **as a fix for the
> magic-link redirect bug**, and it remains correct there. It does not govern this work, which is a
> branding change with a separate prefetch mitigation attached.

## 3. Link format

Both Supabase templates use **Supabase's documented PKCE pattern**:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
```

Two deliberate choices here:

- **`{{ .SiteURL }}` as the base, not `{{ .RedirectTo }}`.** Starting an `href` with a template
  variable and appending query params by hand is undocumented, and Supabase has a known Go
  `html/template` sanitization failure that renders such links as `#ZgotmplZ`
  ([supabase troubleshooting 433665](https://supabase.com/docs/guides/troubleshooting)). Since
  nobody but the owner can send a real email, we stay on the path Supabase itself tests.
- **`type=email` in both templates.** `email` is the generic `EmailOtpType` that verifies both the
  Magic Link and the Confirm-signup token. Guessing `magiclink` vs `signup` per template risks
  silently breaking first-time invitees — who are the common case, because `signInWithOtp` is called
  without `shouldCreateUser: false` and so renders the **Confirm signup** template for them.

**Consequence, accepted by the owner:** the emailed link always points at the production Site URL,
even when the request came from a Vercel preview. The Supabase template is one shared dashboard
setting, so there is no per-environment variant. Magic-link sign-in is therefore verified on
production after merge. Rollback is re-pasting the previous template into the two Supabase tabs.

## 4. Routes

Prefetchers issue GETs, never POSTs. So the GET consumes nothing and the POST does the work.

| Route | Method | Job |
| --- | --- | --- |
| `app/auth/confirm/page.tsx` | GET | Branded "Signing you in…" card. Renders a form holding `token_hash`, `type`, `next` as hidden inputs. **Calls no Supabase API — consumes no token.** |
| `app/auth/confirm/verify/route.ts` | POST | Reads the form body, calls `supabase.auth.verifyOtp({ type, token_hash })`, redirects to the resolved destination. |

The interstitial auto-submits on mount via a small client component, so the visible cost is roughly
a half-second flash. A real `Continue` button is the no-JS fallback and is what a reader sees if the
script never runs. (Supabase's own guidance is a page where the user "manually triggers" the
confirmation; auto-submit is the same defence against every prefetcher that does not execute JS,
which includes Gmail's proxy.)

`app/auth/callback/route.ts` is **unchanged and stays** — Google OAuth still uses it, and
`signInWithOAuth` keeps `redirectTo: callbackUrl()`.

The POST route mirrors the callback's `x-forwarded-host` handling: local dev trusts `origin`,
production prefers `x-forwarded-host`. Failure of any kind redirects to `/sign-in?error=auth`, the
channel `lib/auth/parse-auth-error.ts` already reads — no second error surface.

## 5. `next` propagation

`emailRedirectTo` changes from `${origin}/auth/callback?next=/foo` to plain `${origin}/foo`, so that
`{{ .RedirectTo }}` renders the real destination. It arrives **absolute**, which today's
`resolveNext` rejects outright — every emailed sign-in would land on `/get-started` and invited
members would lose their `/accept-invitation/<token>` deep link.

`lib/auth/resolve-next.ts` therefore grows a second export, `resolveNextFromRedirectTo`, which
reduces an absolute URL to `pathname + search + hash` and then applies **the same** guard, now
extracted to a private `guardPath`. One guard definition, two entry points; `resolveNext` keeps its
exact previous behaviour.

Three properties worth stating, all covered by tests:

- The host is **discarded**, not validated — `https://evil.com/x` becomes `/x` on *our* origin. A
  hostile `next` gains no power a relative `next` did not already have.
- A **bare origin** resolves to `/get-started`, not `/`. Supabase silently substitutes the Site URL
  for a `redirect_to` that misses the allow-list, and `/` would strand a signed-in member on the
  marketing page.
- Protocol-relative (`//evil.com`) and backslash (`/\evil.com`) forms still fall back.

**No new Supabase configuration is required.** The allow-list already carries
`https://www.360churchhealthassessment.com/**` (owner setup doc §B3), which matches the new
`emailRedirectTo` values.

## 6. Decisions taken

| Question | Choice | Who |
| --- | --- | --- |
| Plain confirm route / interstitial / 6-digit OTP | **Interstitial (B)** | Natalie |
| Auto-submit vs manual click | **Auto-submit, button as no-JS fallback** | Natalie |
| Preview-deploy magic links stop working | **Accepted; verify on production** | Natalie |
| `{{ .SiteURL }}` base vs `{{ .RedirectTo }}` base | `{{ .SiteURL }}` (documented, ZgotmplZ-safe) | engineering |
| `type=email` vs per-template `magiclink`/`signup` | `type=email` (generic, no per-template guess) | engineering |
| Extend `resolveNext` vs add a sibling export | Sibling export, shared private guard | engineering |

## 7. Verification boundary

Natalie performs all real auth round-trips. Tests can prove the guard, the route wiring, and that
the GET path consumes nothing. They **cannot** prove that a real magic link signs a real person in —
that requires sending an email and clicking it, which only the owner does. Any completion claim must
say so plainly rather than implying the flow is verified end to end.

## 8. Files

| File | Change |
| --- | --- |
| `lib/auth/resolve-next.ts` | ✅ add `resolveNextFromRedirectTo` + private `guardPath` |
| `tests/auth/resolve-next.test.ts` | ✅ 8 new cases (13 total, green) |
| `app/auth/confirm/page.tsx` | ⬜ interstitial |
| `app/auth/confirm/verify/route.ts` | ⬜ POST verifier |
| `app/sign-in/page.tsx` | ⬜ `emailRedirectTo` → `${origin}${next}`; Google path untouched |
| `docs/owner/magic-link-template.html` | ⬜ new href (button + fallback anchor) |
| `docs/owner/confirm-signup-template.html` | ⬜ new href (button + fallback anchor) |
| `docs/owner/email-auth-owner-setup-2026-08-06.md` | ⬜ inlined template copy, §B3 note, §B4 caveat, checklist |

The three template copies must stay byte-consistent with each other.

## 9. Invariants inherited from PR #70 — do not break

- The plaintext mirror keeps the raw URL (it cannot hyperlink) and emits it **once**, on the CTA
  line.
- Anchor `color` and `text-decoration` stay **inline** — iOS Mail and Outlook otherwise repaint
  links their own blue/purple, which no build-time palette test catches.
