import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  delete process.env.INVITE_FROM
})

describe('sendMemberInvitationEmail', () => {
  it('returns soft failure with no API key (and never calls Resend)', async () => {
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(res).toEqual({ ok: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends member-appropriate copy with church name + co-admin role label', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(res).toEqual({ ok: true })
    const arg = sendMock.mock.calls[0]![0]
    expect(arg.to).toBe('a@test.com')
    expect(arg.subject).toBe("You're invited to help lead Grace")
    expect(arg.html).toContain('Grace')
    expect(arg.html).toContain('co-admin')
    expect(arg.html).toContain('http://x/accept/t')
  })

  it('maps viewer → viewer', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'viewer' })
    expect(sendMock.mock.calls[0]![0].html).toContain('viewer')
  })

  it('sends from EMAIL_FROM when set (verified-domain address)', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'invites@360churchhealthassessment.com'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(sendMock.mock.calls[0]![0].from).toBe('invites@360churchhealthassessment.com')
  })

  it('falls back to the Resend test address when EMAIL_FROM is unset', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(sendMock.mock.calls[0]![0].from).toBe('onboarding@resend.dev')
  })

  it('returns soft failure when Resend errors', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: { message: 'boom' } })
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'viewer' })
    expect(res).toEqual({ ok: false })
  })

  it('wraps the invite in the branded shell with an Accept CTA linking to the invite', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    const arg = sendMock.mock.calls[0]![0]
    expect(arg.html).toContain('XP Gathering')
    expect(arg.html).toContain('CHURCH HEALTH')
    expect(arg.html).toContain('invited to help lead Grace') // heading (apostrophe escaped in html)
    expect(arg.html).toContain('Accept your invitation')
    expect(arg.html).toContain('href="http://x/accept/t"')
    expect(arg.html).toContain('— The XP Gathering team')
  })

  it('sends a plaintext mirror carrying the invite link', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    const arg = sendMock.mock.calls[0]![0]
    expect(typeof arg.text).toBe('string')
    expect(arg.text).toContain('http://x/accept/t')
    expect(arg.text).not.toContain('<table')
  })

  it('prefers INVITE_FROM over EMAIL_FROM', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'shared@360churchhealthassessment.com'
    process.env.INVITE_FROM = 'welcome@360churchhealthassessment.com'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(sendMock.mock.calls[0]![0].from).toBe('welcome@360churchhealthassessment.com')
  })
})
