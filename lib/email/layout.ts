// Shared brand shell for every outgoing app email (invitations, reminders). One source of brand
// truth so both senders render the same refined XP Gathering identity.
//
// Constraints baked in (email clients strip <style>, classes, web fonts, and SVG, and pre-fetch
// images), so:
//   - table-based layout, ALL styles inline
//   - a serif *text* wordmark (Georgia stack) — no logo image, no SVG
//   - a plaintext `text` mirror alongside `html` for deliverability + accessibility
//   - every interpolated value HTML-escaped in the html branch
//   - palette limited to the approved brand set — NO reserved berry (#8E2B3E), NO yellow

export interface EmailCta {
  label: string
  url: string
}

export interface BrandedEmailArgs {
  /** Hidden inbox preview (preheader) text. */
  previewText: string
  /** Serif H1 inside the card. */
  heading: string
  /** Body paragraphs (plain text; escaped into <p> in the html branch). */
  paragraphs: string[]
  /** Optional ink bulletproof button. */
  cta?: EmailCta
  /** Optional "paste this link into your browser:" line (invite only). */
  fallbackLinkLabel?: string
  /** Defaults to "— The XP Gathering team". */
  signoff?: string
}

const DEFAULT_SIGNOFF = '— The XP Gathering team'
const DEFAULT_FROM = 'onboarding@resend.dev'

// Reliable cross-client font stacks (no web fonts): Fraunces → Georgia serif, Hanken → system sans.
const SERIF = "Georgia, 'Times New Roman', Times, serif"
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Approved brand palette (mirrors app/globals.css @theme). Berry (#8E2B3E) is reserved and never
// used here; the yellow master logo is off-palette and never referenced.
const PAPER = '#FBF9F5'
const CARD = '#FFFFFF'
const INK = '#1A1C22'
const INK_SOFT = '#565962'
const LINE = '#E4DED3'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render the branded email shell to both an inline-styled `html` document and a plaintext `text`
 * mirror. All interpolation is HTML-escaped in the html branch.
 */
export function renderBrandedEmail(args: BrandedEmailArgs): { html: string; text: string } {
  const { previewText, heading, paragraphs, cta, fallbackLinkLabel } = args
  const signoff = args.signoff ?? DEFAULT_SIGNOFF

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(
          p,
        )}</p>`,
    )
    .join('')

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr><td align="center" bgcolor="${INK}" style="border-radius:8px;"><a href="${escapeHtml(
        cta.url,
      )}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:${PAPER};text-decoration:none;border-radius:8px;">${escapeHtml(
        cta.label,
      )}</a></td></tr></table>`
    : ''

  const fallbackHtml =
    fallbackLinkLabel && cta
      ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${INK_SOFT};">${escapeHtml(
          fallbackLinkLabel,
        )}<br><span style="word-break:break-all;color:${INK_SOFT};">${escapeHtml(
          cta.url,
        )}</span></p>`
      : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    previewText,
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background-color:${CARD};border:1px solid ${LINE};border-radius:14px;">
<tr>
<td style="padding:40px 40px 0;">
<div style="font-family:${SERIF};font-size:21px;font-weight:500;line-height:1;color:${INK};">XP Gathering</div>
<div style="margin-top:6px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:2.4px;color:${INK_SOFT};">CHURCH HEALTH</div>
</td>
</tr>
<tr>
<td style="padding:28px 40px 0;">
<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;font-weight:500;line-height:1.3;color:${INK};">${escapeHtml(
    heading,
  )}</h1>
${paragraphsHtml}
${ctaHtml}
${fallbackHtml}
</td>
</tr>
<tr>
<td style="padding:28px 40px 40px;">
<div style="border-top:1px solid ${LINE};padding-top:20px;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_SOFT};">
<div>${escapeHtml(signoff)}</div>
<div style="margin-top:4px;">&copy; XP Gathering</div>
</div>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`

  const textParts = ['XP Gathering', 'CHURCH HEALTH', '', heading, '', ...paragraphs]
  if (cta) textParts.push('', `${cta.label}: ${cta.url}`)
  if (fallbackLinkLabel && cta) textParts.push('', fallbackLinkLabel, cta.url)
  textParts.push('', signoff, '© XP Gathering')
  const text = textParts.join('\n')

  return { html, text }
}

function envAddress(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** Invitation sender: INVITE_FROM → EMAIL_FROM → Resend test address. */
export function inviteFrom(): string {
  return envAddress('INVITE_FROM') ?? envAddress('EMAIL_FROM') ?? DEFAULT_FROM
}

/** Reminder sender: REMINDER_FROM → EMAIL_FROM → Resend test address. */
export function reminderFrom(): string {
  return envAddress('REMINDER_FROM') ?? envAddress('EMAIL_FROM') ?? DEFAULT_FROM
}
