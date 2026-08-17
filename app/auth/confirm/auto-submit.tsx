'use client'

import { useEffect } from 'react'

/**
 * Submits the interstitial's form as soon as the page mounts, so a real member sees
 * roughly a half-second flash rather than a page asking them to click twice.
 *
 * It deliberately does no verification of its own — the token is spent by the POST route
 * (`app/auth/confirm/verify/route.ts`) and nowhere else. This component only presses the
 * button a human would otherwise press, which is the whole prefetch defence: a scanner
 * that fetches the link without executing JavaScript never issues that POST, so the
 * one-time token survives until the member actually opens the mail.
 *
 * `requestSubmit()` rather than `submit()`: it fires the submit event and honours
 * validation, and it is what a click on the fallback button would do.
 */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId)
    if (form instanceof HTMLFormElement) form.requestSubmit()
  }, [formId])

  return null
}
