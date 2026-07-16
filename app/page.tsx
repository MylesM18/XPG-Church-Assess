export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl text-ink">Cairn</h1>
      <p className="font-body text-lg text-ink-soft">
        Church health, one honest look at a time.
      </p>
      <a
        href="/sign-in"
        className="rounded-md border border-line bg-sand px-5 py-2 font-body text-ink transition-colors hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Sign in
      </a>
    </main>
  )
}
