import { PasswordlessEntry } from '@/components/auth/passwordless-entry'

// First-time entry. BEGIN THE ASSESSMENT → (both homepage CTAs) and the unauthenticated
// /get-started redirect land here. Same passwordless mechanics as /sign-in — only the greeting
// differs. Supabase itself decides which email fires (Confirm signup for a new address, Magic Link
// for a returning one), so a returning leader who clicks Begin is still signed in normally.
export default function SignUpPage() {
  return (
    <PasswordlessEntry
      copy={{
        heading: 'Glad you’re here.',
        greeting:
          'You’re one step from a clearer picture of your church’s health. Enter your email and we’ll send a secure link to begin — no password to create.',
        submitLabel: 'Send my link',
        sentMessage:
          'Your link is on its way. Check your inbox — the email walks you through what happens next. You can close this tab.',
      }}
    />
  )
}
