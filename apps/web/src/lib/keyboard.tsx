import { type RefObject, useEffect } from 'react'

/**
 * iOS lays the keyboard over the page without resizing it, so whatever sits at the bottom
 * would end up behind it. While `active`, this keeps CSS variables on `ref`'s element with
 * the part of the screen still visible: `--visible-top` and `--visible` (its top and height)
 * and `--keyboard` (how much of the bottom is covered).
 */
export function useVisibleArea(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport
    const element = ref.current
    if (!active || !viewport || !element) return undefined
    const fit = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      element.style.setProperty('--keyboard', `${covered}px`)
      element.style.setProperty('--visible', `${viewport.height}px`)
      element.style.setProperty('--visible-top', `${viewport.offsetTop}px`)
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
      for (const name of ['--keyboard', '--visible', '--visible-top']) {
        element.style.removeProperty(name)
      }
    }
  }, [ref, active])
}

const KEEPER_ID = 'keyboard-keeper'

/**
 * iOS raises the keyboard only for a focus within a tap. Called in the tap that opens a page
 * with a field, this focuses a hidden field that outlives the page change; the page's own
 * field takes the focus, and the keyboard, when it mounts.
 */
export function holdKeyboard() {
  document.getElementById(KEEPER_ID)?.focus()
}

/** The hidden field `holdKeyboard` focuses, rendered once by the app's layout. */
export function KeyboardKeeper() {
  return (
    <input
      id={KEEPER_ID}
      aria-hidden
      tabIndex={-1}
      className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
    />
  )
}
