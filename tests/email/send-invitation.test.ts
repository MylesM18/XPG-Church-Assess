import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sendInvitationEmail } from '@/lib/email/send-invitation'

describe('sendInvitationEmail()', () => {
  const original = process.env.RESEND_API_KEY
  beforeEach(() => { delete process.env.RESEND_API_KEY })
  afterEach(() => { process.env.RESEND_API_KEY = original })

  it('soft-fails (ok:false) without throwing when RESEND_API_KEY is missing', async () => {
    const result = await sendInvitationEmail({
      to: 'someone@example.com',
      link: 'http://127.0.0.1:3000/respond/abc',
      churchName: 'Test Church',
    })
    expect(result).toEqual({ ok: false })
  })
})
