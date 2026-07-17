import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.RESEND_API_KEY
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

  it('returns soft failure when Resend errors', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: { message: 'boom' } })
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'viewer' })
    expect(res).toEqual({ ok: false })
  })
})
