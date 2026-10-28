/**
 * Keeps the page behind sheets from scrolling. A modal <dialog> blocks clicks on the page
 * but not scrolling: on a sheet too short to scroll, a swipe scrolls the page underneath.
 * `overflow: hidden` on the body isn't enough on iOS, so the body is pinned with
 * `position: fixed` at the current scroll position and put back on release. Counted, so
 * one sheet handing over to another keeps the page locked.
 */
let holders = 0
let scrollY = 0

export function lockScroll(): () => void {
  holders += 1
  if (holders === 1) {
    scrollY = window.scrollY
    const { style } = document.body
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.insetInline = '0'
    style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    holders -= 1
    if (holders > 0) return
    const { style } = document.body
    style.position = ''
    style.top = ''
    style.insetInline = ''
    style.overflow = ''
    window.scrollTo(0, scrollY)
  }
}
