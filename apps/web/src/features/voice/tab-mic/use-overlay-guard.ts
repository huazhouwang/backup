import { lockScroll } from '@lullabo/ui/scroll-lock'
import { useEffect, useEffectEvent } from 'react'

/**
 * While the overlay is open: the page behind stays put, even under a sliding finger, and
 * Escape closes it.
 */
export function useOverlayGuard(open: boolean, close: () => void) {
  useEffect(() => (open ? lockScroll() : undefined), [open])
  useEffect(() => {
    if (!open) return undefined
    const still = (event: TouchEvent) => {
      if (!(event.target instanceof Element && event.target.closest('[data-scrolls]'))) {
        event.preventDefault()
      }
      // Nor do the page's own gestures (its bounce, pull to refresh) hear it, on the window
      // after the document; the conversation's scrolling, on its own element, already has.
      event.stopPropagation()
    }
    document.addEventListener('touchmove', still, { passive: false })
    return () => document.removeEventListener('touchmove', still)
  }, [open])
  const onEscape = useEffectEvent(close)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
}
