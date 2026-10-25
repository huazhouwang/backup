/**
 * How a navigation animates: between tabs, into a sub-page, or back out of one; or up into a
 * page that covers the app (the chat) and back down out of it.
 */
export type PageTransition = 'tab' | 'forward' | 'back' | 'up' | 'down'

/** Pages that slide up over the app rather than in from the side. */
const COVERS = new Set(['/chat'])

const depth = (pathname: string) => pathname.split('/').filter(Boolean).length

/**
 * The tabs sit at depth one or less (`/`, `/stats`, `/settings`); anything deeper is a
 * sub-page opened from one, so the depth change says which way to slide.
 */
export function pageTransition(from: string, to: string): PageTransition {
  if (COVERS.has(to)) return 'up'
  if (COVERS.has(from)) return 'down'
  const a = depth(from)
  const b = depth(to)
  if (a <= 1 && b <= 1) return 'tab'
  return b > a ? 'forward' : b < a ? 'back' : 'tab'
}
