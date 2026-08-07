import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import { sendReminderEmail } from '@/lib/email/send-reminder'

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  delete process.env.REMINDER_FROM
  delete process.env.APP_URL
})

describe('sendReminderEmail', () => {
  it('soft-fails with no API key (never calls Resend)', async () => {
    const res = await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(res).toEqual({ ok: false })
    expect(sendMock).not.toHaveBeenCalled()
  })
  it('sends subject + text and reports ok', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ error: null })
    const res = await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(res).toEqual({ ok: true })
    const arg = sendMock.mock.calls[0]![0]
    expect(arg.to).toBe('a@x.com')
    expect(arg.subject).toBe('S')
    expect(arg.html).toContain('T')
  })
  it('uses EMAIL_FROM when set', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.EMAIL_FROM = 'invites@360churchhealthassessment.com'
    sendMock.mockResolvedValue({ error: null })
    await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(sendMock.mock.calls[0]![0].from).toBe('invites@360churchhealthassessment.com')
  })
  it('soft-fails when Resend errors', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ error: { message: 'boom' } })
    expect(await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })).toEqual({ ok: false })
  })

  it('wraps the reminder in the branded shell with an Open-your-assessment CTA', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ error: null })
    await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'Two days left to finish.' })
    const arg = sendMock.mock.calls[0]![0]
    expect(arg.html).toContain('XP Gathering')
    expect(arg.html).toContain('CHURCH HEALTH')
    expect(arg.html).toContain('Two days left to finish.')
    expect(arg.html).toContain('Open your assessment')
    expect(arg.html).toContain('— The XP Gathering team')
    expect(typeof arg.text).toBe('string')
    expect(arg.text).toContain('Two days left to finish.')
  })

  it('defaults the CTA link to the production app URL', async () => {
    process.env.RESEND_API_KEY = 'k'
    sendMock.mockResolvedValue({ error: null })
    await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(sendMock.mock.calls[0]![0].html).toContain('href="https://www.360churchhealthassessment.com"')
  })

  it('points the CTA link at APP_URL when set', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.APP_URL = 'https://staging.example.com'
    sendMock.mockResolvedValue({ error: null })
    await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(sendMock.mock.calls[0]![0].html).toContain('href="https://staging.example.com"')
  })

  it('prefers REMINDER_FROM over EMAIL_FROM', async () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.EMAIL_FROM = 'shared@360churchhealthassessment.com'
    process.env.REMINDER_FROM = 'reminders@360churchhealthassessment.com'
    sendMock.mockResolvedValue({ error: null })
    await sendReminderEmail({ to: 'a@x.com', subject: 'S', text: 'T' })
    expect(sendMock.mock.calls[0]![0].from).toBe('reminders@360churchhealthassessment.com')
  })
})
