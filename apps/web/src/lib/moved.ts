/**
 * Where this page lives at the app's own address, when it is open somewhere else (the
 * address it had before, or workers.dev); null when it is already there, or nothing set
 * one (local and test builds).
 */
export function movedTo(
  appUrl: string,
  here: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>,
): string | null {
  if (!appUrl) return null
  const target = new URL(appUrl)
  if (target.origin === here.origin) return null
  return new URL(`${here.pathname}${here.search}${here.hash}`, target).toString()
}
