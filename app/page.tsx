import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl text-ink">XP Gathering</h1>
      <p className="font-body text-lg text-ink-soft">
        Church health, one honest look at a time.
      </p>

      {user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="font-body text-sm text-ink-soft">Signed in as {user.email}</p>
          <a
            href="/get-started"
            className="rounded-md border border-line bg-ink px-5 py-2 font-body text-paper transition-opacity hover:opacity-90"
          >
            Get started
          </a>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="font-body text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <a
          href="/sign-in"
          className="rounded-md border border-line bg-sand px-5 py-2 font-body text-ink transition-colors hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Sign in
        </a>
      )}
    </main>
  )
}
