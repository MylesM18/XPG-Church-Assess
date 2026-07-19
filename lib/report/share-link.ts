/**
 * Builds the public URL for a share token. Lives here rather than in the diagnosis
 * actions module because Next.js requires every export from a 'use server' file to be
 * an async server action — a sync helper exported there fails the build.
 */
export function shareLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/r/${token}`
}
