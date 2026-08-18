import { PasswordlessEntry } from '@/components/auth/passwordless-entry'

// Returning entry. SIGN IN (homepage header + site header), sign-out, auth-error bounces, the
// membership guard and the accept flow all land here. First-time visitors (BEGIN THE ASSESSMENT →)
// go to /sign-up, which renders the same passwordless mechanics with a first-visit greeting.
export default function SignInPage() {
  return (
    <PasswordlessEntry
      copy={{
        heading: 'Welcome back',
        greeting:
          'Good to have you back. Your church’s assessment is right where you left it — enter your email and we’ll send a secure sign-in link, no password needed.',
        submitLabel: 'Send magic link',
        sentMessage: 'Check your email for a magic link. You can close this tab.',
      }}
    />
  )
}
