import Image from 'next/image'
import { AutoSubmit } from './auto-submit'

// Shared between the <form> and the client component that submits it on mount.
const FORM_ID = 'confirm-sign-in'

// Auth interstitials carry a one-time token in the query string. Keep them out of indexes.
export const metadata = {
  title: 'Signing you in…',
  robots: { index: false, follow: false },
}

/**
 * The GET half of the token_hash sign-in flow.
 *
 * **This page must never call a Supabase API.** Inbox providers and corporate mail scanners
 * pre-fetch the links inside emails, and they do it with GET. A magic link is single-use, so a
 * GET that verified inline would burn the token before the member ever clicked — the
 * `otp_expired` failure this flow exists to close. (`token_hash` on its own does NOT fix that;
 * it is still a single-use GET. The fix is that verification moved to a POST, which no
 * prefetcher issues.) `tests/auth/confirm-interstitial.test.ts` pins the page as inert.
 *
 * So all this does is re-present the emailed parameters as a form aimed at
 * `app/auth/confirm/verify/route.ts`. `AutoSubmit` presses it on mount; the visible
 * "Continue" button is what a reader sees if the script never runs.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // A repeated param arrives as an array; there is no sensible "both", so take neither.
  const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6"
    >
      <div className="flex flex-col items-start gap-[6px]">
        <Image
          src="/landing/logo-dark.png"
          alt="XP Gathering"
          width={750}
          height={100}
          priority
          className="h-auto w-[180px]"
        />
        <small className="font-body text-[9px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          Church Health
        </small>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink">Signing you in…</h1>
        <p className="font-body text-sm text-ink-soft">
          One moment while we confirm your link. If nothing happens, use the button below.
        </p>
      </div>

      <form id={FORM_ID} method="post" action="/auth/confirm/verify" className="flex flex-col gap-3">
        <input type="hidden" name="token_hash" value={one(params.token_hash)} />
        <input type="hidden" name="type" value={one(params.type)} />
        <input type="hidden" name="next" value={one(params.next)} />
        <button
          type="submit"
          className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Continue
        </button>
      </form>

      <AutoSubmit formId={FORM_ID} />
    </main>
  )
}
