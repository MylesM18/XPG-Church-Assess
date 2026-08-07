import { describe, it, expect, beforeEach } from 'vitest'
import { renderBrandedEmail, inviteFrom, reminderFrom } from '@/lib/email/layout'

// The branded email shell is the single source of brand truth for every outgoing app email.
// These tests pin the invariants the spec locks: table-based inline-styled HTML + a plaintext
// mirror, the official "+ XP GATHERING" logo (hosted PNG, alt="XP Gathering" fallback for
// image-blocking clients), HTML-escaped interpolation, an optional bulletproof CTA, the default
// team signoff, and a markup palette with NO reserved berry (#8E2B3E) and NO yellow HEX — the
// logo's yellow lives inside the image binary, not the HTML.

const APPROVED_HEXES = new Set([
  '#FBF9F5', // paper (page bg)
  '#FFFFFF', // card
  '#1A1C22', // ink
  '#565962', // ink-soft
  '#E4DED3', // line
  '#4E6B60', // sage
  '#EEE8DD', // sand
])

function hexesIn(html: string): string[] {
  return (html.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toUpperCase())
}

describe('renderBrandedEmail', () => {
  it('returns non-empty html and text', () => {
    const { html, text } = renderBrandedEmail({
      previewText: 'Preview',
      heading: 'Hello there',
      paragraphs: ['First line.', 'Second line.'],
    })
    expect(html.length).toBeGreaterThan(0)
    expect(text.length).toBeGreaterThan(0)
  })

  it('carries the official XP Gathering logo and CHURCH HEALTH eyebrow', () => {
    const { html } = renderBrandedEmail({ previewText: 'p', heading: 'H', paragraphs: ['x'] })
    expect(html).toContain('logo-dark.png') // official "+ XP GATHERING" hosted PNG
    expect(html).toContain('XP Gathering') // survives as the logo's alt fallback
    expect(html).toContain('CHURCH HEALTH')
    expect(html).toContain('<table')
  })

  it('renders heading and every paragraph in the html', () => {
    const { html } = renderBrandedEmail({
      previewText: 'p',
      heading: 'A warm heading',
      paragraphs: ['Alpha paragraph.', 'Bravo paragraph.'],
    })
    expect(html).toContain('A warm heading')
    expect(html).toContain('Alpha paragraph.')
    expect(html).toContain('Bravo paragraph.')
  })

  it('includes the hidden preview text', () => {
    const { html } = renderBrandedEmail({
      previewText: 'A short inbox preview',
      heading: 'H',
      paragraphs: ['x'],
    })
    expect(html).toContain('A short inbox preview')
  })

  it('defaults the signoff to the XP Gathering team when none is given', () => {
    const { html, text } = renderBrandedEmail({ previewText: 'p', heading: 'H', paragraphs: ['x'] })
    expect(html).toContain('— The XP Gathering team')
    expect(text).toContain('— The XP Gathering team')
  })

  it('honours a custom signoff', () => {
    const { html, text } = renderBrandedEmail({
      previewText: 'p',
      heading: 'H',
      paragraphs: ['x'],
      signoff: '— Warmly, Natalie',
    })
    expect(html).toContain('— Warmly, Natalie')
    expect(text).toContain('— Warmly, Natalie')
    expect(html).not.toContain('— The XP Gathering team')
  })

  it('HTML-escapes interpolated content to prevent broken markup / injection', () => {
    const { html } = renderBrandedEmail({
      previewText: 'p',
      heading: 'Grace & Co <script>alert("x")</script>',
      paragraphs: ['5 < 6 & "quoted"'],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('Grace &amp; Co &lt;script&gt;')
    expect(html).toContain('5 &lt; 6 &amp; &quot;quoted&quot;')
  })

  it('renders a bulletproof CTA linking to the given url when provided', () => {
    const { html, text } = renderBrandedEmail({
      previewText: 'p',
      heading: 'H',
      paragraphs: ['x'],
      cta: { label: 'Accept your invitation', url: 'https://app.test/accept/abc' },
    })
    expect(html).toContain('Accept your invitation')
    expect(html).toContain('href="https://app.test/accept/abc"')
    expect(text).toContain('Accept your invitation: https://app.test/accept/abc')
  })

  it('escapes ampersands inside the CTA href', () => {
    const { html } = renderBrandedEmail({
      previewText: 'p',
      heading: 'H',
      paragraphs: ['x'],
      cta: { label: 'Open', url: 'https://app.test/x?a=1&b=2' },
    })
    expect(html).toContain('href="https://app.test/x?a=1&amp;b=2"')
    expect(html).not.toContain('a=1&b=2"')
  })

  it('omits all links when no CTA and no fallback link are given', () => {
    const { html } = renderBrandedEmail({ previewText: 'p', heading: 'H', paragraphs: ['x'] })
    expect(html).not.toContain('<a ')
  })

  it('renders the paste-in-browser fallback link line when requested', () => {
    const { html } = renderBrandedEmail({
      previewText: 'p',
      heading: 'H',
      paragraphs: ['x'],
      cta: { label: 'Accept', url: 'https://app.test/accept/abc' },
      fallbackLinkLabel: 'Or paste this link into your browser:',
    })
    expect(html).toContain('Or paste this link into your browser:')
    // The raw link is present as text for copy/paste as well as in the button href.
    expect(html.split('https://app.test/accept/abc').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('uses only approved brand hex colors — no reserved berry, no yellow', () => {
    const { html } = renderBrandedEmail({
      previewText: 'p',
      heading: 'H',
      paragraphs: ['x'],
      cta: { label: 'Go', url: 'https://app.test/x' },
      fallbackLinkLabel: 'Or paste:',
    })
    const hexes = hexesIn(html)
    expect(hexes.length).toBeGreaterThan(0)
    for (const hex of hexes) {
      expect(APPROVED_HEXES, `unexpected off-palette color ${hex}`).toContain(hex)
    }
    expect(html.toUpperCase()).not.toContain('#8E2B3E') // berry, reserved
  })

  it('produces a plaintext mirror with no HTML tags', () => {
    const { text } = renderBrandedEmail({
      previewText: 'p',
      heading: 'The Heading',
      paragraphs: ['A body sentence.'],
      cta: { label: 'Do it', url: 'https://app.test/x' },
    })
    expect(text).toContain('The Heading')
    expect(text).toContain('A body sentence.')
    expect(text).not.toContain('<table')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('href=')
  })
})

describe('sender address split', () => {
  beforeEach(() => {
    delete process.env.INVITE_FROM
    delete process.env.REMINDER_FROM
    delete process.env.EMAIL_FROM
  })

  it('inviteFrom prefers INVITE_FROM, then EMAIL_FROM, then the Resend test address', () => {
    expect(inviteFrom()).toBe('onboarding@resend.dev')
    process.env.EMAIL_FROM = 'invites@360churchhealthassessment.com'
    expect(inviteFrom()).toBe('invites@360churchhealthassessment.com')
    process.env.INVITE_FROM = 'welcome@360churchhealthassessment.com'
    expect(inviteFrom()).toBe('welcome@360churchhealthassessment.com')
  })

  it('reminderFrom prefers REMINDER_FROM, then EMAIL_FROM, then the Resend test address', () => {
    expect(reminderFrom()).toBe('onboarding@resend.dev')
    process.env.EMAIL_FROM = 'invites@360churchhealthassessment.com'
    expect(reminderFrom()).toBe('invites@360churchhealthassessment.com')
    process.env.REMINDER_FROM = 'reminders@360churchhealthassessment.com'
    expect(reminderFrom()).toBe('reminders@360churchhealthassessment.com')
  })

  it('trims surrounding whitespace on the resolved address', () => {
    process.env.INVITE_FROM = '  welcome@360churchhealthassessment.com  '
    expect(inviteFrom()).toBe('welcome@360churchhealthassessment.com')
  })
})
