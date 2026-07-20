import Link from 'next/link'

// Root not-found boundary. Next renders its unstyled default when this file is absent, which
// leaves the root layout's skip link pointing at a #main-content that does not exist. This
// supplies the real <main> landmark target so the skip link resolves on every route.
export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6"
    >
      <h1 className="font-display text-2xl text-ink">Page not found</h1>
      <p className="font-body text-ink-soft">
        We could not find that page. The link may be wrong, or the page may have moved.
      </p>
      <Link
        href="/"
        className="py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Back home
      </Link>
    </main>
  )
}
